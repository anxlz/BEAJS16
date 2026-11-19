import { z } from "zod";
import type { NotificationTypeEnum } from "../../../common/enum/index.js";
import * as validators from "../notification.validation.js";

export type ListNotificationsDto = z.infer<typeof validators.listNotifications>["query"];

export interface INotifyInput {
    recipientId: string;
    senderId: string;
    type: NotificationTypeEnum;
    targetId: string;
}
