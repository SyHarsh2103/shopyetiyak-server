import express, { Router } from "express";

import { asyncHandler } from "../../utils/async-handler.js";
import { stripeWebhook } from "./stripe-webhook.controller.js";

export const stripeWebhookRouter = Router();

stripeWebhookRouter.post(
  "/",
  express.raw({ type: "application/json", limit: "1mb" }),
  asyncHandler(stripeWebhook),
);
