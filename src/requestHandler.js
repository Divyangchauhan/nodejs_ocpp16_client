const { VALID_ACTIONS } = require('./ocpp');
const CP = require('../data/chargepoints');
const authorize = require('../ocpp/authorize');


const requestHandler = (
    stationId,
    messageFromUI,
    {
        ws,
        getMsgId,
        getQueue,
        addToQueue,
        getActiveTransaction,
        addLog,
        getLogs,
        authList,
        authCache
    },
    wsUI
) => {
    const messageType = 2;
    const [action] = messageFromUI;
    const messageId = getMsgId();
    const { transactionId } = getActiveTransaction() || {};
    const payload = getPayload(stationId, messageFromUI, { transactionId });
    const req = [messageType, messageId, action, payload];

    const isValidAction = VALID_ACTIONS.includes(action);
    const isNewReq = !getQueue().some(q => q.action === action);
    const isValidPayload = true;
    let isAuthorized = true;
    const isValidRequest = isValidAction && isNewReq && isValidPayload;

    if (action === 'Authorize') {
        const { idTag } = messageFromUI[1];
        isAuthorized = authorize({ idTag, authList, authCache });

        if (isAuthorized && isValidRequest) {
            console.log('Already authorized');
        } else if (!isAuthorized && isValidRequest) {
            sendMessage(ws, req, addToQueue, addLog, sendLogsToUI(wsUI, getLogs()));
        } else {
            console.log('Not authorized or invalid id tag');
        }
    } else {
        if (isValidRequest) {
            sendMessage(ws, req, addToQueue, addLog, sendLogsToUI(wsUI, getLogs()));
        } else {
            console.log('Invalid action or payload');
        }
    }
};

function sendMessage(wsClient, req, addToQueue, addLog, cb) {
    // send to OCPP server
    wsClient.send(JSON.stringify(req), () => {
        console.log('Message sent: ' + JSON.stringify(req));

        let [_, messageId, action, payload] = req;

        let pendingReq = { messageId, action, ...payload };

        // requests await conf from server are added to queue
        addToQueue(pendingReq);

        addLog('REQ', req);

        cb();
    });
}

function sendLogsToUI(wsUI, logs) {
    return function() {
        wsUI.send(JSON.stringify(['OCPP', logs]));
    };
}

function getPayload(stationId, [action, payloadFromStation = {}], extras) {
    let payload = {}, timestamp;
    switch (action) {
        case 'Authorize':
            payload = { ...payloadFromStation };
            break;
        case 'DataTransfer':
            let vendorId = 'E8EAFB';
            let data = 'hello';
            payload = { vendorId, data, ...payloadFromStation };
            break;
        case 'BootNotification':
            payload = { ...CP[stationId].props, ...payloadFromStation };
            break;
        case 'StartTransaction':
            timestamp = new Date().toISOString();
            payload = { meterStart: 10, timestamp, ...payloadFromStation };
            break;
        case 'StopTransaction':
            timestamp = new Date().toISOString();
            const { transactionId } = extras;
            payload = {
                meterStop: 15,
                timestamp,
                transactionId,
                idTag: payloadFromStation.idTag,
                reason: payloadFromStation.reason
            };
            break;
    }

    // some info from the station, some from the ocpp client
    return payload;
}

module.exports = requestHandler;
