import { z } from "zod";
import * as validators from "../post.validation.js";

export type CreatePostDto = z.infer<typeof validators.createPost>["body"];
export type UpdatePostDto = z.infer<typeof validators.updatePost>["body"];
export type FeedDto = z.infer<typeof validators.getFeed>["query"];
