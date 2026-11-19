import { model, Schema, type Types } from "mongoose";
import { NotificationTypeEnum } from "../../common/enum/index.js";
import type { INotification } from "../../common/interface/index.js";

const notificationSchema = new Schema<INotification>(
    {
        recipient_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        sender_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: Object.values(NotificationTypeEnum), required: true },
        // Post Or User
        target_id: { type: Schema.Types.ObjectId, required: true },
        is_read: { type: Boolean, default: false }
    },
    { timestamps: { createdAt: "created_at", updatedAt: false } }
);

// Maps To _id
notificationSchema.virtual("notification_id").get(function (this: { _id: Types.ObjectId }) {
    return String(this._id);
});

notificationSchema.index({ recipient_id: 1, created_at: -1 });
notificationSchema.index({ recipient_id: 1, is_read: 1 });

export const NotificationModel = model<INotification>("Notification", notificationSchema);
