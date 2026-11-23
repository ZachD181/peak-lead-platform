const INTRO_COUPON_ID = 'peak_intro_99x2_first10_v1';
const INTRO_AMOUNT = 9900;
const REGULAR_AMOUNT = 20000;
const MAX_ACTIVATIONS = 10;

function validatePrice(price) {
  if (!price?.active || price.unit_amount !== REGULAR_AMOUNT || price.currency !== 'usd' ||
      price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1 || !price.product) {
    throw new Error('Introductory offer requires the active USD 200 monthly plan.');
  }
}

function validateCoupon(coupon, price) {
  const productId = typeof price.product === 'string' ? price.product : price.product.id;
  if (coupon.id !== INTRO_COUPON_ID || coupon.amount_off !== REGULAR_AMOUNT - INTRO_AMOUNT ||
      coupon.currency !== 'usd' || coupon.duration !== 'repeating' || coupon.duration_in_months !== 2 ||
      coupon.max_redemptions !== MAX_ACTIVATIONS || coupon.livemode !== price.livemode ||
      coupon.applies_to?.products?.length !== 1 || coupon.applies_to.products[0] !== productId) {
    throw new Error('Introductory coupon configuration does not match the published offer.');
  }
}

// Only an eligible authenticated checkout may provision the coupon. Public plan reads never mutate Stripe.
async function getIntroductoryOffer(stripe, price, { enabled = false, create = false } = {}) {
  if (!enabled) return null;
  validatePrice(price);
  let coupon;
  try { coupon = await stripe.coupons.retrieve(INTRO_COUPON_ID, { expand: ['applies_to'] }); }
  catch (error) {
    if (error.code !== 'resource_missing') throw error;
    if (create) {
      const productId = typeof price.product === 'string' ? price.product : price.product.id;
      try {
        coupon = await stripe.coupons.create({
          id: INTRO_COUPON_ID,
          expand: ['applies_to'],
          name: 'Peak: $99 first 2 paid months',
          amount_off: REGULAR_AMOUNT - INTRO_AMOUNT,
          currency: 'usd',
          duration: 'repeating',
          duration_in_months: 2,
          max_redemptions: MAX_ACTIVATIONS,
          applies_to: { products: [productId] },
          metadata: { offer: INTRO_COUPON_ID, trial_days: '14', paid_months: '2' },
        }, { idempotencyKey: INTRO_COUPON_ID + '-create' });
      } catch (creationError) {
        // Another request can create the deterministic coupon concurrently.
        if (creationError.code !== 'resource_already_exists') throw creationError;
        coupon = await stripe.coupons.retrieve(INTRO_COUPON_ID, { expand: ['applies_to'] });
      }
    }
  }
  if (coupon) validateCoupon(coupon, price);
  const redeemed = coupon?.times_redeemed || 0;
  return {
    available: coupon ? coupon.valid && redeemed < MAX_ACTIVATIONS : true,
    amount: INTRO_AMOUNT,
    paidMonths: 2,
    maxActivations: MAX_ACTIVATIONS,
    remainingActivations: Math.max(0, MAX_ACTIVATIONS - redeemed),
  };
}

module.exports = { INTRO_COUPON_ID, getIntroductoryOffer };
