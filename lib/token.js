'use strict';
const safemath = {
    mul: function (a, b) {
        if (a == 0) {
            return 0;
        }
        const c = a * b;
        if (c / a != b) {
            throw Error('Data overflow error!');
        }
        return c;
    },
    div: function (a, b) {
        if (b == 0) {
            throw Error('Divided by zero!');
        }
        return a / b;
    },
    sub: function (a, b) {
        if (a < b) {
            throw Error('subtrahend is greater than minuend!');
        }
        return a - b;
    },
    add: function (a, b) {
        const c = a + b;
        if (c < a) {
            throw Error('Data overflow error!');
        }
        return c;
    }
}

/**
 * Track the trade of a commodity from one trader to another
 * @param {org.huibao.token.Transfer} transfer - the transfer to be processed
 * @transaction
 */
async function transToken(transfer) {
    var factory = getFactory();
    const from = getCurrentParticipant();
    const transValue = transfer.value;
    if (transValue <= 0) {
        throw new Error('value must > 0');
    }
    const to = transfer.to; 
    const fromId = from.getIdentifier()
    // if (fromId != 'admin') {
    //     throw new Error('from must admin');
    // }
    const balanceRegistry = await getAssetRegistry('org.huibao.token.Balance');    
    let exists = await balanceRegistry.exists(fromId);
    if (!exists) {
        throw new Error('no from balance');
    }
    const adminBalance = await balanceRegistry.get(fromId);
    if (adminBalance.value < transValue) {
        throw new Error('no enough balance');
    }
    adminBalance.value = safemath.sub(adminBalance.value, transValue);
    await balanceRegistry.update(adminBalance);

    const toId = to.getIdentifier();
    const userRegistry = await getParticipantRegistry('org.huibao.participant.User');
    exists = await userRegistry.exists(toId);
    if (!exists) {
        throw new Error('no participant: ' + toId);
    }
    exists= await balanceRegistry.exists(toId);
    if (!exists) {
        var newBalance = factory.newResource('org.huibao.token', 'Balance', toId);
        newBalance.value = transValue;
        await balanceRegistry.add(newBalance);
    } else {
        const toBalance = await balanceRegistry.get(toId);
        toBalance.value = safemath.add(toBalance.value, transValue);
        await balanceRegistry.update(toBalance); 
    }
    const event = factory.newEvent('org.huibao.token', 'TransferNotification');
    event.value = transValue;
    event.from = from.getFullyQualifiedIdentifier();
    event.to = to.getFullyQualifiedIdentifier();
    emit(event);
}