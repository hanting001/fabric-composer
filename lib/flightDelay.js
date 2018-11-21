'use strict';

/**
 * 得到航班延误价格，此版更具商品类型获得价格
 * @param {org.huibao.product.flightDelay.transaction.GetPriceTx} tx
 * @transaction
 * @returns {price} 商品价格.
 */
async function getPrice(tx) {
    const productRegistry = await getAssetRegistry('org.huibao.product.flightDelay.asset.FlightDelayProduct');
    const product = await productRegistry.get(tx.pid);
    return product.premium;
}

/**
 * 用户购买后加入航班
 * @param {org.huibao.product.flightDelay.transaction.JoinTx} tx
 * @transaction
 */
async function join(tx) {
    const flightInfo = tx.flightInfo;
    const user = tx.user;
    const operator = getCurrentParticipant();
    //check flightInfo

    const factory = getFactory();
    const id = user.getIdentifier() + flightInfo.getIdentifier();
    const contractRegistry = await getAssetRegistry('org.huibao.product.flightDelay.asset.FlightDelayContract');
    const exists = await contractRegistry.exists(id);
    if (exists) {
        throw new Error('不能重复购买同一天的同一个航班');
    }
    //校验购买日期
    const now = Date.now() + 8 * 60 * 60 * 1000;
    console.log(now);
    const flightDeptimePlanDateTime = Date.parse(flightInfo.flightDeptimePlanDate);
    console.log(flightDeptimePlanDateTime);
    console.log(flightDeptimePlanDateTime - now);
    if ((flightDeptimePlanDateTime - now) < 24 * 60 * 60 * 1000) {
        throw new Error('只可以购买24小时后的航班');
    }
    const contract = factory.newResource('org.huibao.product.flightDelay.asset', 'FlightDelayContract', id);
    contract.insured = user;
    contract.flightInfo = flightInfo;
    contract.operator = operator;
    
    await contractRegistry.add(contract);
    const event = factory.newEvent('org.huibao.product.flightDelay.transaction', 'JoinedEvent');
    event.contract = contract;
    emit(event);
    return contract;
}

/**
 * 对航班号进行校验
 * @param {org.huibao.product.flightDelay.transaction.CheckFlightTx} tx
 * @transaction
 * @returns {org.huibao.product.flightDelay.asset.FlightInfo} 航班信息
 */
async function checkFlight(tx) {
    const fid = tx.flightNO + tx.flightDate;
    const flightInfoRegistry = await getAssetRegistry('org.huibao.product.flightDelay.asset.FlightInfo');
    const exists = await flightInfoRegistry.exists(fid);
    if (exists) {
        return await flightInfoRegistry.get(fid);
    }
    const result = await request('http://114.55.110.165:3000/api/' + tx.flightNO + '/' + tx.flightDate);
    const resultJson = JSON.parse(result);
    if (resultJson.error_code) {
        throw new Error('查询航班信息出错:' + resultJson.error);
    }
    if (resultJson.length == 0) {
        throw new Error('查询航班信息出错:' + resultJson.error);
    }
    // console.log(resultJson[0]);
    const factory = getFactory();
    const flightInfoResource = factory.newResource('org.huibao.product.flightDelay.asset', 'FlightInfo', fid);
    flightInfoResource.flightNO = tx.flightNO;
    flightInfoResource.flightDate = tx.flightDate;
    flightInfoResource.flightDeptimePlanDate = getDateFromStr(resultJson[0].FlightDeptimePlanDate, resultJson[0].org_timezone);
    flightInfoResource.flightArrtimePlanDate = getDateFromStr(resultJson[0].FlightArrtimePlanDate, resultJson[0].dst_timezone);
    await flightInfoRegistry.add(flightInfoResource);
    return flightInfoResource;
}

/**
 * 对航班号进行校验
 * @param {org.huibao.product.flightDelay.transaction.CheckFlightDelayTx} tx
 * @transaction
 * @returns {org.huibao.product.flightDelay.asset.FlightInfo} 航班信息
 */
async function checkFlightDelay(tx) {
    const flightInfo = tx.flightInfo;
    const flightInfoRegistry = await getAssetRegistry('org.huibao.product.flightDelay.asset.FlightInfo');
    if (flightInfo.isDelay) {
        return flightInfo;
    }
    const now = Date.now() + 8 * 60 * 60 * 1000;
    const planArrTime = Date.parse(flightInfo.flightArrtimePlanDate);
    let delay = now - planArrTime;
    if (delay < 0) {
        throw new Error('还未到计划到达时间');
    }
    const result = await request('http://114.55.110.165:3000/api/' + flightInfo.flightNO + '/' + flightInfo.flightDate);
    const resultJson = JSON.parse(result);
    if (resultJson.error_code) {
        throw new Error('查询航班信息出错:' + resultJson.error);
    }
    if (resultJson.length == 0) {
        throw new Error('查询航班信息出错:' + resultJson.error);
    }
    // console.log(resultJson[0]);
    flightInfo.flightState = resultJson[0].FlightState;
    if (flightInfo.flightState == '到达'){
        flightInfo.flightArrtimeDate = getDateFromStr(resultJson[0].FlightArrtimeDate, resultJson[0].dst_timezone);
        delay = Date.parse(flightInfo.flightArrtimeDate) - planArrTime;
        console.log(delay);
        if (delay <= 30 * 60 * 1000 ) {
            // 30分钟以内不算延误
            flightInfo.isDelay = false;
            flightInfo.delayLevel = 'NO';
        } else {
            flightInfo.isDelay = true;
            if (30 * 60 * 1000 < delay < 60 * 60 * 1000) {
                flightInfo.delayLevel = 'HH';
            } else if (60 * 60 * 1000 <= delay < 2 * 60 * 60 * 1000) {
                flightInfo.delayLevel = 'ONEH';
            } else if (2 * 60 * 60 * 1000 <= delay < 3 * 60 * 60 * 1000) {
                flightInfo.delayLevel = 'TWOH';
            } else if (3 * 60 * 60 * 1000 <= delay) {
                flightInfo.delayLevel = 'THREEH';
            }
        }
    }
    if (flightInfo.flightState.indexOf('取消') > 0) {
        flightInfo.isDelay = true;
        flightInfo.delayLevel = 'THREEH';
    }
    await flightInfoRegistry.update(flightInfo);
    return flightInfo;
}
function getDateFromStr(str, timeZone) {
    let date = new Date(str);
    if (timeZone) {
        let time = Date.parse(date) + timeZone * 1000;
        date = new Date(time);
    }
    // console.log(date);
    return date;
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