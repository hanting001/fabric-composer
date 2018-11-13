'use strict';

/**
 * 得到航班延误价格，此版更具商品类型获得价格
 * @param {org.huibao.product.flightDelay.GetPriceTx} tx
 * @transaction
 * @returns {price} 商品价格.
 */
async function getPrice(tx) {
    const productRegistry = await getAssetRegistry('org.huibao.product.flightDelay.FlightDelayProduct');
    const product = await productRegistry.get(tx.pid);
    return product.premium;
}

/**
 * 用户购买后加入航班
 * @param {org.huibao.product.flightDelay.JoinTx} tx
 * @transaction
 */
async function join(tx) {
    const flightInfo = tx.flightInfo;
    const user = tx.user;
    const operator = getCurrentParticipant();
    //check flightInfo

    const factory = getFactory();
    const id = await getNextSeq('contract');
    const contract = factory.newResource('org.huibao.product.flightDelay', 'FlightDelayContract', 'c' + id);
    contract.insured = user;
    contract.flightInfo = flightInfo;
    contract.operator = operator;
    const contractRegistry = await getAssetRegistry('org.huibao.product.flightDelay.FlightDelayContract');
    await contractRegistry.add(contract);
    const event = factory.newEvent('org.huibao.product.flightDelay', 'JoinedEvent');
    event.contract = contract;
    emit(event);
    return contract;
}

async function getNextSeq(sid){
    const seqRegistry = await getAssetRegistry('org.huibao.product.Sequnce');
    const exists = await seqRegistry.exists(sid);
    if (!exists) {
        const factory = getFactory();
        const seq = factory.newResource('org.huibao.product', 'Sequnce', sid);
        seq.next += 1;
        await seqRegistry.update(seq);
        return seq.next;
    } else {
        const seq = seqRegistry.get(sid);
        seq.next += 1;
        await seqRegistry.update(seq);
        return seq.next;
    }
}