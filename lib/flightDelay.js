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
    await checkFlight(flightInfo);
    const user = tx.user;
    const operator = getCurrentParticipant();
    //check flightInfo

    const factory = getFactory();
    const id = user.getIdentifier() + flightInfo.getIdentifier();
    const contractRegistry = await getAssetRegistry('org.huibao.product.flightDelay.FlightDelayContract');
    const exists = await contractRegistry.exists(id);
    if (exists) {
        throw new Error('不能重复购买同一天的同一个航班');
    }
    const contract = factory.newResource('org.huibao.product.flightDelay', 'FlightDelayContract', id);
    contract.insured = user;
    contract.flightInfo = flightInfo;
    contract.operator = operator;
    
    await contractRegistry.add(contract);
    const event = factory.newEvent('org.huibao.product.flightDelay', 'JoinedEvent');
    event.contract = contract;
    emit(event);
    return contract;
}
async function checkFlight(flightInfo) {
    const fid = flightInfo.flightNO + flightInfo.flightDate;
    if (fid != flightInfo.fid) {
        throw new Error('fid must == flightNO + flightDate');
    }
    const flightInfoRegistry = await getAssetRegistry('org.huibao.product.flightDelay.FlightInfo');
    const exists = await flightInfoRegistry.exists(fid);
    if (exists) {
        return;
    }
    const result = await request('http://114.55.110.165:3000/api/' + flightInfo.flightNO + '/' + flightInfo.flightDate);
    console.log(result);

}
async function getNextSeq(sid){
    const seqRegistry = await getAssetRegistry('org.huibao.product.Sequnce');
    const exists = await seqRegistry.exists(sid);
    if (!exists) {
        const factory = getFactory();
        const seq = factory.newResource('org.huibao.product', 'Sequnce', sid);
        seq.next += 1;
        await seqRegistry.add(seq);
        return seq.next;
    } else {
        const seq = seqRegistry.get(sid);
        seq.next += 1;
        await seqRegistry.update(seq);
        return seq.next;
    }
}