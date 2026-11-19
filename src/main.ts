import cors from "cors";
import express from "express";
import type { Readable } from "node:stream";
import { APPLICATION_NAME, PORT } from "./config.js";
import { connectDB, connectRedis } from "./DB/connection.db.js";
import { BadRequestException, NotFoundException } from "./common/exception/index.js";
import { cloudService } from "./common/service/index.js";
import { successResponse } from "./common/utils/index.js";
import { authentication, globalErrorHandling } from "./middleware/index.js";
import { authenticationController, commentController, notificationController, postController, userController } from "./modules/index.js";

const bootstrap = async (): Promise<void> => {
    const app = express();

    app.use(cors());
    app.use(express.json());

    app.get("/", (req, res) => {
        res.status(200).json({ message: "Welcome to Social App", status: 200 });
    });

    app.use("/auth", authenticationController);
    app.use("/user", userController);
    app.use("/post", postController);
    app.use("/comment", commentController);
    app.use("/notification", notificationController);

    // ---------- Uploaded Files ----------
    // App Files Only
    const getAssetKey = (path: string | string[]): string => {
        const key = Array.isArray(path) ? path.join("/") : path;
        if (!key.startsWith(`${APPLICATION_NAME}/`) || key.includes("..")) {
            throw new BadRequestException("Invalid asset key");
        }
        return key;
    };

    // GET /uploads/pre-signed/*path
    app.get("/uploads/pre-signed/*path", authentication(), async (req, res) => {
        const { download, filename } = req.query as { download?: string; filename?: string };
        const url = await cloudService.createFetchPreSignedAssetLink({
            Key: getAssetKey((req.params as { path: string[] }).path),
            download,
            filename
        });
        successResponse({ res, message: "Pre-signed link created", data: { url } });
    });

    // GET /uploads/*path
    app.get("/uploads/*path", authentication(), async (req, res) => {
        const { download, filename } = req.query as { download?: string; filename?: string };
        const Key = getAssetKey((req.params as { path: string[] }).path);

        try {
            const { Body, ContentType } = await cloudService.getAsset({ Key });
            res.setHeader("Content-Type", ContentType ?? "application/octet-stream");
            if (download === "true") {
                res.setHeader("Content-Disposition", `attachment; filename="${filename || Key.split("/").pop()}"`);
            }
            (Body as Readable).pipe(res);
        } catch (error) {
            if ((error as Error).name === "NoSuchKey") {
                throw new NotFoundException("Asset not found");
            }
            throw error;
        }
    });

    app.all("{/*dummy}", (req, res) => {
        res.status(404).json({ message: "Invalid application routing", status: 404 });
    });

    app.use(globalErrorHandling);

    await connectDB();
    await connectRedis();

    app.listen(PORT, () => {
        console.log(`Social App listening on port ${PORT}!`);
    });
};

bootstrap().catch((error) => {
    console.log("Fail to start the application", error);
    process.exit(1);
});
