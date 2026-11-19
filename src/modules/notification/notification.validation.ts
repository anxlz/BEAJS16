import { z } from "zod";
import { generalValidationFields } from "../../common/utils/validation.js";

const { objectId } = generalValidationFields;

export const listNotifications = z.object({
    query: z.strictObject({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(10),
        unread: z
            .enum(["true", "false"])
            .transform((value) => value === "true")
            .optional()
    })
});

export const notificationIdOnly = z.object({
    params: z.strictObject({ notificationId: objectId })
});
