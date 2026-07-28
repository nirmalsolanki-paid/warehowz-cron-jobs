// Maps a Stripe PaymentMethod onto a Card document (card or us_bank_account).
function applyPaymentMethodToCard(card, pm) {
  if (pm.type === 'us_bank_account') {
    if (!pm.us_bank_account) return false;
    card.bank_account.account_id = pm.id;
    card.bank_account.accountHolderName = pm.billing_details.name || '';
    card.bank_account.accountType = pm.us_bank_account.account_holder_type;
    card.bank_account.routingNumber = pm.us_bank_account.routing_number;
    card.bank_account.bankName = pm.us_bank_account.bank_name || '';
    card.paymentMethodId = pm.id;
    card.type = 'bank_account';
    card.acc_last4 = pm.us_bank_account.last4;
    card.cardId = '';
    card.cardBrand = '';
    card.cardExpMonth = null;
    card.cardExpYear = null;
    card.stripeTokenType = 'bank_account';

    return true;
  }

  if (pm.type === 'card') {
    card.paymentMethodId = pm.id;
    card.cardId = pm.id;
    card.type = 'card';
    card.acc_last4 = pm.card.last4;
    card.cardBrand = pm.card.brand;
    card.cardExpMonth = pm.card.exp_month;
    card.cardExpYear = pm.card.exp_year;
    card.stripeTokenType = 'card';
    card.bank_account.account_id = '';
    card.bank_account.accountHolderName = '';
    card.bank_account.accountType = '';
    card.bank_account.routingNumber = '';
    card.bank_account.bankName = '';
    card.bank_account.status = '';
    card.mandateId = '';
    card.setupIntentId = '';
    card.microdepositType = 'amounts';

    return true;
  }

  return false;
}

function clearCardPaymentMethod(card) {
  card.paymentMethodId = '';
  card.cardId = '';
  card.cardBrand = '';
  card.cardExpMonth = null;
  card.cardExpYear = null;
  card.acc_last4 = '';
  card.stripeTokenType = '';
  card.type = undefined;
  card.status = 'Created';
  card.setupIntentId = '';
  card.mandateId = '';
  card.microdepositType = 'amounts';
  card.bank_account.account_id = '';
  card.bank_account.accountHolderName = '';
  card.bank_account.accountType = '';
  card.bank_account.routingNumber = '';
  card.bank_account.accountNumber = '';
  card.bank_account.bankName = '';
  card.bank_account.status = '';
}

async function findPendingBankAccountSetupIntent(stripe, customerId) {
  const setupIntents = await stripe.setupIntents.list({
    customer: customerId,
    limit: 5
  });
  const pendingSi = setupIntents.data.find(
    (si) =>
      si.status !== 'succeeded' && si.status !== 'canceled' && si.payment_method
  );
  if (!pendingSi) return null;

  const pm = await stripe.paymentMethods.retrieve(pendingSi.payment_method);
  if (pm.type !== 'us_bank_account' || !pm.us_bank_account) return null;

  const microdepositType =
    (pendingSi.next_action &&
      pendingSi.next_action.verify_with_microdeposits &&
      pendingSi.next_action.verify_with_microdeposits.microdeposit_type) ||
    'descriptor_code';

  return { pm, setupIntentId: pendingSi.id, microdepositType };
}

function applyPendingBankAccountToCard(card, pending) {
  const { pm, setupIntentId, microdepositType } = pending;
  applyPaymentMethodToCard(card, pm);
  card.setupIntentId = setupIntentId;
  card.microdepositType = microdepositType;
  card.status = 'Released';
}

async function isBankAccountVerified(stripe, customerId, pm) {
  try {
    const source = await stripe.customers.retrieveSource(customerId, pm.id);
    if (source && source.object === 'bank_account') {
      return source.status === 'verified';
    }
  } catch (err) {
    // Not retrievable as a legacy source — fall through.
  }

  return true;
}

async function refreshCardFromStripe(stripe, card) {
  if (!card || !card.customerId) return false;

  const customer = await stripe.customers.retrieve(card.customerId);
  if (customer.deleted) return false;

  const defaultPaymentMethodId =
    customer.invoice_settings &&
    customer.invoice_settings.default_payment_method;

  let pm = null;
  try {
    if (defaultPaymentMethodId) {
      pm = await stripe.paymentMethods.retrieve(defaultPaymentMethodId);
    } else {
      const list = await stripe.paymentMethods.list({
        customer: card.customerId,
        limit: 1
      });
      pm = list.data && list.data[0];
    }
  } catch (err) {
    if (err.code !== 'resource_missing') throw err;
    pm = null;
  }

  if (pm) {
    const verified =
      pm.type !== 'us_bank_account' ||
      (await isBankAccountVerified(stripe, card.customerId, pm));
    const newStatus = verified ? 'Verified' : 'Released';

    if (!applyPaymentMethodToCard(card, pm)) return false;

    if (!verified) {
      card.setupIntentId = '';
      card.mandateId = '';
    }

    card.delete = false;
    card.status = newStatus;

    // Even when the payment method id is unchanged, Stripe details (exp
    // date, brand, bank name, etc.) can change in place — always apply them
    // above, and only skip the write if nothing actually differs.
    if (!card.isModified()) return false;

    card.updatedAt = Date.now();
    await card.save();

    return true;
  }

  const pending = await findPendingBankAccountSetupIntent(
    stripe,
    card.customerId
  );
  if (pending) {
    applyPendingBankAccountToCard(card, pending);
    card.delete = false;

    if (!card.isModified()) return false;

    card.updatedAt = Date.now();
    await card.save();

    return true;
  }

  if (card.delete && !card.paymentMethodId) return false;
  clearCardPaymentMethod(card);
  card.delete = true;
  card.updatedAt = Date.now();
  await card.save();

  return true;
}

async function abandonOldPaymentMethod(stripe, oldPmId, oldSetupIntentId) {
  if (oldSetupIntentId) {
    await stripe.setupIntents.cancel(oldSetupIntentId).catch(() => {});
  }
  if (oldPmId) {
    await stripe.paymentMethods.detach(oldPmId).catch(() => {});
  }
}

module.exports = {
  applyPaymentMethodToCard,
  refreshCardFromStripe,
  abandonOldPaymentMethod
};
