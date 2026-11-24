import { createHmac, timingSafeEqual } from 'crypto';
import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type IHttpRequestMethods,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { getParsers } from '../Pluckbox/getParsers';

const API = 'https://pluckbox.onibaku.co.uk/v1';

async function pluckboxRequest(
	this: IHookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
) {
	try {
		return (await this.helpers.httpRequestWithAuthentication.call(this, 'pluckboxApi', {
			method,
			url: `${API}${path}`,
			body,
			json: true,
		})) as IDataObject;
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject);
	}
}

// Pluckbox-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of `${t}.${body}`>
export function validSignature(secret: string, body: string, header: string, now = Date.now()) {
	const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
	const t = Number(parts.t);
	if (!Number.isFinite(t) || Math.abs(now / 1000 - t) > 300) return false;
	const expected = Buffer.from(createHmac('sha256', secret).update(`${t}.${body}`).digest('hex'));
	const given = Buffer.from(String(parts.v1 ?? ''));
	return given.length === expected.length && timingSafeEqual(given, expected);
}

export class PluckboxTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Pluckbox Trigger',
		name: 'pluckboxTrigger',
		icon: { light: 'file:../../icons/pluckbox.svg', dark: 'file:../../icons/pluckbox.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Pluckbox finishes parsing a document',
		defaults: { name: 'Pluckbox Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'pluckboxApi', required: true }],
		webhooks: [
			{ name: 'default', httpMethod: 'POST', responseMode: 'onReceived', path: 'webhook' },
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: [
					{
						name: 'Document Parsed',
						value: 'document.parsed',
						description: 'Check Needs Review for low-confidence fields',
					},
					{ name: 'Document Failed', value: 'document.failed' },
					{ name: 'Document Reviewed', value: 'document.reviewed' },
				],
				default: ['document.parsed'],
			},
			{
				displayName: 'Parser Name or ID',
				name: 'parserId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getParsers' },
				default: '',
				description:
					'Only documents from this parser. Leave empty for every parser. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			},
		],
	};

	methods = { loadOptions: { getParsers } };

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (!data.webhookId) return false;
				const hooks = (await pluckboxRequest.call(this, 'GET', '/webhooks')) as {
					data?: Array<{ id: number }>;
				};
				if (hooks.data?.some((hook) => hook.id === data.webhookId)) return true;
				delete data.webhookId;
				delete data.secret;
				return false;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const body: IDataObject = {
					url: this.getNodeWebhookUrl('default'),
					events: this.getNodeParameter('events') as string[],
				};
				const parserId = this.getNodeParameter('parserId') as number | string;
				if (parserId) body.parserId = Number(parserId);
				const hook = await pluckboxRequest.call(this, 'POST', '/webhooks', body);
				const data = this.getWorkflowStaticData('node');
				data.webhookId = hook.id;
				data.secret = hook.secret;
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const data = this.getWorkflowStaticData('node');
				if (data.webhookId) {
					try {
						await pluckboxRequest.call(this, 'DELETE', `/webhooks/${data.webhookId as number}`);
					} catch (error) {
						if ((error as NodeApiError).httpCode !== '404') return false;
					}
				}
				delete data.webhookId;
				delete data.secret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const secret = this.getWorkflowStaticData('node').secret as string | undefined;
		const raw = (req as unknown as { rawBody?: Buffer }).rawBody?.toString('utf8') ?? '';
		if (!secret || !validSignature(secret, raw, String(req.headers['pluckbox-signature'] ?? ''))) {
			this.getResponseObject().status(401).send('Invalid signature');
			return { noWebhookResponse: true };
		}
		return { workflowData: [this.helpers.returnJsonArray(this.getBodyData())] };
	}
}
