import { Router } from "express";
import { asyncHandler } from "../../utils/async-handler.js";
import { getPublicMarketing } from "./marketing.controller.js";
export const publicMarketingRouter = Router();
publicMarketingRouter.get("/", asyncHandler(getPublicMarketing));
