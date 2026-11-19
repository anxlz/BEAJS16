import { Types } from "mongoose";
import { NotificationTypeEnum } from "../../common/enum/index.js";
import { BadRequestException, NotFoundException } from "../../common/exception/index.js";
import type { INotification, RawDocument } from "../../common/interface/index.js";
import { NotificationRepository, UserRepository } from "../../common/repository/index.js";
import { notificationService, type NotificationService } from "../../common/service/index.js";
import type { INotifyInput, ListNotificationsDto } from "./dto/index.js";

const NOTIFICATION_TEXT: Record<NotificationTypeEnum, (name: string) => string> = {
    [NotificationTypeEnum.COMMENT]: (name) => `${name} commented on your post`,
    [NotificationTypeEnum.FOLLOW]: (name) => `${name} started following you`,
    [NotificationTypeEnum.FOLLOW_REQUEST]: (name) => `${name} requested to follow you`,
    [NotificationTypeEnum.FOLLOW_ACCEPTED]: (name) => `${name} accepted your follow request`
};

export class NotificationsService {
    constructor(
        private readonly notificationRepository: NotificationRepository = new NotificationRepository(),
        private readonly userRepository: UserRepository = new UserRepository(),
        private readonly pushService: NotificationService = notificationService
    ) {}

    private toNotification(
        notification: RawDocument<INotification>,
        sender?: { id: string; username: string; image: string | null }
    ) {
        return {
            notification_id: String(notification._id),
            recipient_id: String(notification.recipient_id),
            sender_id: String(notification.sender_id),
            type: notification.type,
            target_id: String(notification.target_id),
            is_read: notification.is_read,
            created_at: notification.created_at,
            message: NOTIFICATION_TEXT[notification.type](sender?.username ?? "Someone"),
            sender: sender ?? null
        };
    }

    // Push To Devices
    private async push({ recipientId, senderId, type, targetId }: INotifyInput): Promise<void> {
        try {
            if (!this.pushService.isConfigured()) return;

            const [recipient, sender] = await Promise.all([
                this.userRepository.findById(recipientId, "+fcmTokens", { lean: true }),
                this.userRepository.findById(senderId, "firstName lastName", { lean: true })
            ]);
            const tokens = recipient?.fcmTokens ?? [];
            if (!tokens.length || !sender) return;

            await this.pushService.sendNotifications({
                tokens,
                title: "Social App",
                body: NOTIFICATION_TEXT[type](`${sender.firstName} ${sender.lastName}`),
                data: { type, target_id: targetId }
            });
        } catch (error) {
            console.log("Push failed:", (error as Error).message);
        }
    }

    // ---------- Used By Other Modules ----------
    // Best Effort Only
    async notify(input: INotifyInput) {
        if (input.recipientId === input.senderId) return null;
        try {
            const notification = await this.notificationRepository.create({
                recipient_id: new Types.ObjectId(input.recipientId),
                sender_id: new Types.ObjectId(input.senderId),
                type: input.type,
                target_id: new Types.ObjectId(input.targetId),
                is_read: false
            });
            void this.push(input);
            return this.toNotification(notification.toObject());
        } catch (error) {
            console.log("Notification failed:", (error as Error).message);
            return null;
        }
    }

    // Request Closed
    async removeFollowRequest(recipientId: string, senderId?: string): Promise<void> {
        try {
            await this.notificationRepository.deleteMany({
                recipient_id: recipientId,
                ...(senderId ? { sender_id: senderId } : {}),
                type: NotificationTypeEnum.FOLLOW_REQUEST
            });
        } catch (error) {
            console.log("Notification cleanup failed:", (error as Error).message);
        }
    }

    // Post Deleted Forever
    async removePostNotifications(postId: string): Promise<void> {
        try {
            await this.notificationRepository.deleteMany({ target_id: postId, type: NotificationTypeEnum.COMMENT });
        } catch (error) {
            console.log("Notification cleanup failed:", (error as Error).message);
        }
    }

    // ---------- 1. Get Notifications ----------
    async list(userId: string, dto: ListNotificationsDto) {
        const filter: Record<string, unknown> = { recipient_id: userId };
        if (dto.unread !== undefined) filter.is_read = !dto.unread;

        const [total, unread, notifications] = await Promise.all([
            this.notificationRepository.countDocuments(filter),
            this.notificationRepository.countDocuments({ recipient_id: userId, is_read: false }),
            this.notificationRepository.find(filter, undefined, {
                lean: true,
                sort: { created_at: -1 },
                skip: (dto.page - 1) * dto.limit,
                limit: dto.limit
            })
        ]);

        // Sender Names
        const senderIds = [...new Set(notifications.map((notification) => String(notification.sender_id)))];
        const senders = await this.userRepository.find({ _id: { $in: senderIds } }, "firstName lastName image", { lean: true });
        const senderMap = new Map(
            senders.map((sender) => [
                String(sender._id),
                { id: String(sender._id), username: `${sender.firstName} ${sender.lastName}`, image: sender.image ?? null }
            ])
        );

        return {
            total,
            unread,
            page: dto.page,
            limit: dto.limit,
            items: notifications.map((notification) => this.toNotification(notification, senderMap.get(String(notification.sender_id))))
        };
    }

    // ---------- 2. Mark One Read ----------
    async markAsRead(userId: string, notificationId: string) {
        const result = await this.notificationRepository.updateOne(
            { _id: notificationId, recipient_id: userId },
            { $set: { is_read: true } }
        );
        if (!result.matchedCount) {
            throw new NotFoundException("Notification not found");
        }
        return { notification_id: notificationId, is_read: true };
    }

    // ---------- 3. Mark All Read ----------
    async markAllAsRead(userId: string) {
        const result = await this.notificationRepository.updateMany(
            { recipient_id: userId, is_read: false },
            { $set: { is_read: true } }
        );
        return { updated: result.modifiedCount };
    }

    // ---------- 4. Test Push ----------
    async sendTestPush(userId: string) {
        const user = await this.userRepository.findById(userId, "+fcmTokens", { lean: true });
        const tokens = user?.fcmTokens ?? [];
        if (!tokens.length) {
            throw new BadRequestException("Save an FCM token first");
        }

        const results = await this.pushService.sendNotifications({
            tokens,
            title: "Social App",
            body: "Push notifications are working"
        });
        const sent = results.filter((result) => result.status === "fulfilled").length;
        return { sent, failed: results.length - sent };
    }
}

export const notificationsService = new NotificationsService();
