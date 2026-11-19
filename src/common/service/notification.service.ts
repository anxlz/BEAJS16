import { cert, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FIREBASE_SERVICE_ACCOUNT_PATH } from "../../config.js";
import { BadRequestException } from "../exception/index.js";

export class NotificationService {
    private client?: App;

    // Firebase Key File
    isConfigured(): boolean {
        return existsSync(resolve(FIREBASE_SERVICE_ACCOUNT_PATH));
    }

    private getClient(): App {
        if (!this.client) {
            if (!this.isConfigured()) {
                throw new BadRequestException("Firebase is not configured");
            }
            const secretFile = JSON.parse(readFileSync(resolve(FIREBASE_SERVICE_ACCOUNT_PATH), "utf-8"));
            this.client = initializeApp({
                credential: cert(secretFile)
            });
        }
        return this.client;
    }

    async sendNotification({
        token,
        title,
        body,
        data
    }: {
        token: string;
        title: string;
        body: string;
        data?: Record<string, string>;
    }) {
        return getMessaging(this.getClient()).send({ token, notification: { title, body }, data });
    }

    // Many Devices
    async sendNotifications({
        tokens,
        title,
        body,
        data
    }: {
        tokens: string[];
        title: string;
        body: string;
        data?: Record<string, string>;
    }) {
        this.getClient();
        return await Promise.allSettled(tokens.map((token) => this.sendNotification({ token, title, body, data })));
    }
}

export const notificationService = new NotificationService();
