import { Router } from "express";
import { successResponse } from "../../common/utils/index.js";
import { authentication, validation } from "../../middleware/index.js";
import { notificationsService } from "./notification.service.js";
import * as validators from "./notification.validation.js";

const router = Router();

router.use(authentication());

// 1. GET /notification
router.get("/", validation(validators.listNotifications), async (req, res) => {
    const data = await notificationsService.list(String(req.user._id), req.validate.query);
    successResponse({ res, message: "Notifications fetched", data });
});

// 2. PATCH /notification/read-all
router.patch("/read-all", async (req, res) => {
    const data = await notificationsService.markAllAsRead(String(req.user._id));
    successResponse({ res, message: "All notifications read", data });
});

// 3. POST /notification/test-push
router.post("/test-push", async (req, res) => {
    const data = await notificationsService.sendTestPush(String(req.user._id));
    successResponse({ res, message: "Test push sent", data });
});

// 4. PATCH /notification/:notificationId/read
router.patch("/:notificationId/read", validation(validators.notificationIdOnly), async (req, res) => {
    const data = await notificationsService.markAsRead(String(req.user._id), req.validate.params.notificationId);
    successResponse({ res, message: "Notification read", data });
});

export default router;
