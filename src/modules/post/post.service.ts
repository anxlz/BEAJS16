import { unlink } from "node:fs/promises";
import { Types } from "mongoose";
import { StorageApproachEnum } from "../../common/enum/index.js";
import { BadRequestException, ForbiddenException, NotFoundException } from "../../common/exception/index.js";
import type { IPost, RawDocument } from "../../common/interface/index.js";
import { CommentRepository, PostRepository, UserRepository } from "../../common/repository/index.js";
import { cloudService } from "../../common/service/index.js";
import { notificationsService, type NotificationsService } from "../notification/notification.service.js";
import type { CreatePostDto, FeedDto, UpdatePostDto } from "./dto/index.js";

export class PostService {
    constructor(
        private readonly postRepository: PostRepository = new PostRepository(),
        private readonly commentRepository: CommentRepository = new CommentRepository(),
        private readonly userRepository: UserRepository = new UserRepository(),
        private readonly notifications: NotificationsService = notificationsService
    ) {}

    private async toPost(post: RawDocument<IPost>) {
        const attachments = await Promise.all(
            (post.attachments ?? []).map(async (key) => ({
                key,
                url: await cloudService.createFetchPreSignedAssetLink({ Key: key })
            }))
        );
        return {
            id: String(post._id),
            content: post.content ?? null,
            attachments,
            userId: String(post.userId),
            createdAt: post.createdAt,
            updatedAt: post.updatedAt
        };
    }

    // Upload Files
    private async uploadFiles(userId: string, files: Express.Multer.File[]) {
        try {
            return await cloudService.uploadAssets({
                storageApproach: StorageApproachEnum.DISK,
                path: `post/${userId}`,
                files
            });
        } finally {
            await Promise.all(files.map((file) => unlink(file.path).catch(() => undefined)));
        }
    }

    // Delete Files
    private async deleteFiles(keys: string[]) {
        if (keys.length) {
            await cloudService.deleteAssets({ Keys: keys.map((Key) => ({ Key })) });
        }
    }

    // Find Owned Post
    private async getOwnedPost(userId: string, postId: string) {
        const post = await this.postRepository.findById(postId, undefined, { lean: true });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        if (String(post.userId) !== userId) {
            throw new ForbiddenException("Only the post owner can do this");
        }
        return post;
    }

    // ---------- 1. Create Post ----------
    async createPost(userId: string, dto: CreatePostDto, files: Express.Multer.File[] = []) {
        if (!dto.content && !files.length) {
            throw new BadRequestException("Post needs content or attachments");
        }
        const attachments = await this.uploadFiles(userId, files);
        const post = await this.postRepository.create({
            content: dto.content,
            attachments,
            userId: new Types.ObjectId(userId)
        });
        return await this.toPost(post.toObject());
    }

    // ---------- 2. Get All Posts ----------
    async getMyPosts(userId: string) {
        const posts = await this.postRepository.find({ userId }, undefined, { lean: true, sort: { createdAt: -1 } });
        return await Promise.all(posts.map((post) => this.toPost(post)));
    }

    // ---------- 2.1 Get Feed ----------
    async getFeed(userId: string, dto: FeedDto) {
        // Own And Following
        const viewer = await this.userRepository.findById(userId, "following", { lean: true });
        const filter = { userId: { $in: [...(viewer?.following ?? []), new Types.ObjectId(userId)] } };

        const [total, posts] = await Promise.all([
            this.postRepository.countDocuments(filter),
            this.postRepository.find(filter, undefined, {
                lean: true,
                sort: { createdAt: -1 },
                skip: (dto.page - 1) * dto.limit,
                limit: dto.limit
            })
        ]);
        return {
            total,
            page: dto.page,
            limit: dto.limit,
            items: await Promise.all(posts.map((post) => this.toPost(post)))
        };
    }

    // ---------- 3. Get Single Post ----------
    async getPost(postId: string) {
        const post = await this.postRepository.findById(postId, undefined, { lean: true });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        return await this.toPost(post);
    }

    // ---------- 4. Update Post ----------
    async updatePost(userId: string, postId: string, dto: UpdatePostDto, files: Express.Multer.File[] = []) {
        const post = await this.getOwnedPost(userId, postId);
        if (!dto.content && !files.length) {
            throw new BadRequestException("Send new content or new attachments");
        }

        const update: Record<string, unknown> = {};
        if (dto.content) update.content = dto.content;
        if (files.length) update.attachments = await this.uploadFiles(userId, files);

        await this.postRepository.updateOne({ _id: postId }, { $set: update });

        // Replace Old Files
        if (files.length) {
            await this.deleteFiles(post.attachments ?? []);
        }
        return await this.getPost(postId);
    }

    // ---------- 5. Delete Post ----------
    async deletePost(userId: string, postId: string) {
        await this.getOwnedPost(userId, postId);
        await this.postRepository.updateOne(
            { _id: postId },
            { $set: { deletedAt: new Date(), deletedBy: new Types.ObjectId(userId) } }
        );
        return { id: postId };
    }

    // ---------- 6. Force Delete Post ----------
    async forceDeletePost(userId: string, postId: string) {
        const post = await this.postRepository.findOne({ _id: postId, paranoid: false }, undefined, { lean: true });
        if (!post) {
            throw new NotFoundException("Post not found");
        }
        if (String(post.userId) !== userId) {
            throw new ForbiddenException("Only the post owner can do this");
        }

        await this.postRepository.deleteOne({ _id: postId });
        await this.commentRepository.deleteMany({ postId });
        await this.notifications.removePostNotifications(postId);
        await this.deleteFiles(post.attachments ?? []);
        return { id: postId };
    }
}

export const postService = new PostService();
