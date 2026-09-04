import { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import { deliveryEligibility, publicDeliverySlots } from "./delivery.controller.js";

export const deliveryRouter = Router();
deliveryRouter.get("/eligibility", asyncHandler(deliveryEligibility));
deliveryRouter.get("/slots", asyncHandler(publicDeliverySlots));
