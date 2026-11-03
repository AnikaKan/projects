// Hand-computed reference amounts (worked out on paper from the fictional scenario inputs, NOT read from the app).
// The evaluation compares the app's deterministic calculations and every rendered language version against these.
import type { Business } from '../../../src/lib/calc'

type Ref = Record<Business, Record<string, number>>

/** Assessment items: derived values (inputs in comments). */
export const ITEM_REFERENCES: Record<string, Ref> = {
  // sales − cost
  rvp_a_is_sales_profit: { vegetable: { profit: 200 }, tea: { profit: 150 }, grocery: { profit: 200 } }, // 500−300, 400−250, 800−600
  // sales − cost; sales + cost (distractor)
  rvp_b_find_profit: {
    vegetable: { profit: 300, salesPlusCost: 1700 }, // 1000−700, 1000+700
    tea: { profit: 250, salesPlusCost: 950 }, // 600−350, 600+350
    grocery: { profit: 400, salesPlusCost: 2600 }, // 1500−1100, 1500+1100
  },
  // stock + transport
  exp_b_total_stock_cost: { vegetable: { total: 650 }, tea: { total: 440 }, grocery: { total: 1600 } }, // 600+50, 400+40, 1500+100
  // cash + credit (distractor); correct answer is cash
  crd_b_cash_in_box: { vegetable: { both: 900 }, tea: { both: 600 }, grocery: { both: 1500 } }, // 700+200, 450+150, 1200+300
  // box − stock money needed tomorrow
  sav_a_keep_stock_money: { vegetable: { spare: 300 }, tea: { spare: 300 }, grocery: { spare: 500 } }, // 900−600, 700−400, 2000−1500
}

/** Lesson 1 (sales vs profit) scenarios. */
export const LESSON_REFERENCES: Record<'example' | 'practice' | 'check', Ref> = {
  example: {
    vegetable: { left: 200, profit: 130, salesPlusGoods: 800 }, // 500−300; 500−300−40−30; 500+300
    tea: { left: 250, profit: 190, salesPlusGoods: 950 }, // 600−350; 600−350−60; 600+350
    grocery: { left: 300, profit: 250, salesPlusGoods: 2700, cashInBox: 1300 }, // 1500−1200; 1500−1200−50; 1500+1200; 1500−200 udhaar
  },
  practice: {
    vegetable: { left: 350, profit: 270, allCosts: 530 }, // 800−450; 800−450−50−30; 450+50+30
    tea: { left: 450, profit: 370, allCosts: 530 }, // 900−450; 900−450−80; 450+80
    grocery: { left: 500, profit: 400, allCosts: 1600 }, // 2000−1500; 2000−1500−100; 1500+100
  },
  check: {
    vegetable: { profitBefore: 200, profitAfter: 150 }, // 500−300; 700−550
    tea: { profitBefore: 250, profitAfter: 200 }, // 600−350; 800−600
    grocery: { profitBefore: 300, profitAfter: 250 }, // 1500−1200; 1800−1550
  },
}
