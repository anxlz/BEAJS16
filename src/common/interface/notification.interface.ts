import type { Types } from "mongoose";
import type { NotificationTypeEnum } from "../enum/index.js";

export interface INotification {
    recipient_id: Types.ObjectId;
    sender_id: Types.ObjectId;
    type: NotificationTypeEnum;
    target_id: Types.ObjectId;
    is_read: boolean;
    created_at?: Date;
}
