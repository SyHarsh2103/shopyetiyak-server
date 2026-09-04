import type { Types } from "mongoose";

import { TaxRuleModel } from "../taxes/tax-rule.model.js";

export interface TaxLineInput {
  productId: string;
  variantId: string;
  taxClassification: string;
  taxableAmountMinor: number;
  quantity: number;
}

export interface TaxAddressInput {
  country: string;
  state: string;
  city: string;
  postalCode: string;
}

export interface TaxQuoteInput {
  currency: string;
  address: TaxAddressInput;
  lines: TaxLineInput[];
}

export interface TaxLineQuote {
  productId: string;
  variantId: string;
  taxableAmountMinor: number;
  taxMinor: number;
  rateBasisPoints: number;
  ruleId: string | null;
}

export interface TaxQuote {
  amountMinor: number;
  status: "CONFIGURED" | "NO_MATCH";
  message: string;
  lines: TaxLineQuote[];
}

export interface TaxService {
  quote(input: TaxQuoteInput): Promise<TaxQuote>;
}

function normalized(value: string): string {
  return value.trim().toUpperCase();
}

function matchesOptional(
  ruleValue: string,
  actualValue: string,
): boolean {
  return (
    ruleValue === "" ||
    ruleValue === actualValue
  );
}

function specificity(rule: {
  productId?: Types.ObjectId | null;
  taxClassification: string;
  postalCode: string;
  state: string;
  city: string;
  priority: number;
}): number {
  return (
    rule.priority * 100 +
    (rule.productId ? 50 : 0) +
    (rule.taxClassification ? 20 : 0) +
    (rule.postalCode ? 10 : 0) +
    (rule.state ? 5 : 0) +
    (rule.city ? 2 : 0)
  );
}

class MongoTaxService implements TaxService {
  async quote(
    input: TaxQuoteInput,
  ): Promise<TaxQuote> {
    const now = new Date();

    const country = normalized(
      input.address.country,
    );

    const state = normalized(
      input.address.state,
    );

    const city = normalized(
      input.address.city,
    );

    const postalCode = normalized(
      input.address.postalCode,
    );

    const rules = await TaxRuleModel.find({
      isActive: true,
      country,
      $and: [
        {
          $or: [
            {
              startsAt: null,
            },
            {
              startsAt: {
                $lte: now,
              },
            },
          ],
        },
        {
          $or: [
            {
              endsAt: null,
            },
            {
              endsAt: {
                $gte: now,
              },
            },
          ],
        },
      ],
    }).lean();

    let matchedCount = 0;

    const lines = input.lines.map((line) => {
      const classification = normalized(
        line.taxClassification,
      );

      const matching = rules
        .filter(
          (rule) =>
            matchesOptional(
              rule.state,
              state,
            ) &&
            matchesOptional(
              rule.city,
              city,
            ) &&
            matchesOptional(
              rule.postalCode,
              postalCode,
            ) &&
            matchesOptional(
              rule.taxClassification,
              classification,
            ) &&
            (
              !rule.productId ||
              rule.productId.toString() ===
                line.productId
            ),
        )
        .sort(
          (
            left,
            right,
          ) =>
            specificity(right) -
            specificity(left),
        );

      const rule = matching[0];

      if (!rule) {
        return {
          productId:
            line.productId,
          variantId:
            line.variantId,
          taxableAmountMinor:
            line.taxableAmountMinor,
          taxMinor:
            0,
          rateBasisPoints:
            0,
          ruleId:
            null,
        };
      }

      matchedCount += 1;

      return {
        productId:
          line.productId,
        variantId:
          line.variantId,
        taxableAmountMinor:
          line.taxableAmountMinor,
        taxMinor:
          Math.round(
            line.taxableAmountMinor *
              (
                rule.rateBasisPoints /
                10000
              ),
          ),
        rateBasisPoints:
          rule.rateBasisPoints,
        ruleId:
          rule._id.toString(),
      };
    });

    return {
      amountMinor:
        lines.reduce(
          (sum, line) =>
            sum +
            line.taxMinor,
          0,
        ),
      status:
        matchedCount > 0
          ? "CONFIGURED"
          : "NO_MATCH",
      message:
        matchedCount > 0
          ? "Tax estimated from active MongoDB tax rules."
          : "No active tax rule matched this checkout location and product classification.",
      lines,
    };
  }
}

export const taxService: TaxService =
  new MongoTaxService();