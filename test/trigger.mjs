// Live check of the trigger against the Pluckbox API: PLUCKBOX_API_KEY=pbk_... node test/trigger.mjs (after npm run build)
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
	PluckboxTrigger,
	validSignature,
} from '../dist/nodes/PluckboxTrigger/PluckboxTrigger.node.js';

const key = process.env.PLUCKBOX_API_KEY;
assert.ok(key, 'set PLUCKBOX_API_KEY');
const staticData = {};
const params = { events: ['document.parsed', 'document.failed'], parserId: '' };

async function request(_cred, o) {
	const res = await fetch(o.url, {
		method: o.method ?? 'GET',
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
		body: o.body ? JSON.stringify(o.body) : undefined,
	});
	const body = res.status === 204 ? undefined : await res.json();
	if (!res.ok) throw Object.assign(new Error(body?.detail), { httpCode: String(res.status) });
	return body;
}

const hooks = {
	getNode: () => ({ name: 'Pluckbox Trigger' }),
	getWorkflowStaticData: () => staticData,
	getNodeParameter: (name) => params[name],
	getNodeWebhookUrl: () => 'https://example.com/n8n-pluckbox-test',
	helpers: { httpRequestWithAuthentication: request },
};
const methods = new PluckboxTrigger().webhookMethods.default;

assert.equal(await methods.checkExists.call(hooks), false);
assert.equal(await methods.create.call(hooks), true);
assert.match(staticData.secret, /^whsec_/);
const listed = await request(null, { url: 'https://pluckbox.onibaku.co.uk/v1/webhooks' });
assert.deepEqual(listed.data.find((h) => h.id === staticData.webhookId).events, params.events);
assert.equal(await methods.checkExists.call(hooks), true);

// A delivery signed the way Pluckbox signs them becomes one item; a bad signature gets a 401
const body = JSON.stringify({ event: 'document.parsed', id: 7, data: { total: 120 } });
const t = Math.floor(Date.now() / 1000);
const sig = `t=${t},v1=${createHmac('sha256', staticData.secret).update(`${t}.${body}`).digest('hex')}`;
let status;
const delivery = (header) => ({
	getRequestObject: () => ({
		rawBody: Buffer.from(body),
		headers: { 'pluckbox-signature': header },
	}),
	getResponseObject: () => ({ status: (s) => ((status = s), { send() {} }) }),
	getWorkflowStaticData: () => staticData,
	getBodyData: () => JSON.parse(body),
	helpers: { returnJsonArray: (o) => [o].flat().map((json) => ({ json })) },
});
const trigger = new PluckboxTrigger();
const ok = await trigger.webhook.call(delivery(sig));
assert.deepEqual(
	ok.workflowData[0].map((i) => i.json.data.total),
	[120],
);
assert.deepEqual(await trigger.webhook.call(delivery(`t=${t},v1=${'0'.repeat(64)}`)), {
	noWebhookResponse: true,
});
assert.equal(status, 401);
assert.equal(validSignature(staticData.secret, body, `t=${t - 600},v1=x`), false);

assert.equal(await methods.delete.call(hooks), true);
assert.equal(staticData.webhookId, undefined);
console.log('trigger ok');
