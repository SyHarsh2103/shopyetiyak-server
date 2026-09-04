import { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import { publicPickupSlots } from "./pickup.controller.js";

export const pickupRouter = Router();
pickupRouter.get("/slots", asyncHandler(publicPickupSlots));
