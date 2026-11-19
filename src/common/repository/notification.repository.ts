import { NotificationModel } from "../../DB/model/index.js";
import type { INotification } from "../interface/index.js";
import { BaseRepository } from "./base.repository.js";

export class NotificationRepository extends BaseRepository<INotification> {
    constructor() {
        super(NotificationModel);
    }
}
