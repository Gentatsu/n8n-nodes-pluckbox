import {
	NodeConnectionTypes,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type INodeProperties,
	type INodeType,
	type INodeTypeDescription,
} from 'n8n-workflow';
import { getParsers } from './getParsers';

const forParse = { resource: ['document'], operation: ['parse'] };
const forGet = { resource: ['document'], operation: ['get', 'review'] };
const forGetMany = { resource: ['document'], operation: ['getAll'] };
const forReview = { resource: ['document'], operation: ['review'] };

const qs = (name: string) => ({
	send: { type: 'query' as const, property: name, value: '={{$value || undefined}}' },
});

// Sends the file (or text) as the raw request body, with its type and name, as POST /parsers/{id}/documents expects
async function documentBody(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	if (this.getNodeParameter('input') === 'text') {
		requestOptions.body = this.getNodeParameter('text') as string;
		requestOptions.headers = {
			...requestOptions.headers,
			'Content-Type': 'text/plain; charset=utf-8',
		};
		requestOptions.qs = { ...requestOptions.qs, filename: 'text.txt' };
	} else {
		const property = this.getNodeParameter('binaryPropertyName') as string;
		const binary = this.helpers.assertBinaryData(property);
		requestOptions.body = await this.helpers.getBinaryDataBuffer(property);
		requestOptions.headers = {
			...requestOptions.headers,
			'Content-Type': binary.mimeType || 'application/octet-stream',
		};
		if (binary.fileName) requestOptions.qs = { ...requestOptions.qs, filename: binary.fileName };
	}
	requestOptions.json = false;
	return requestOptions;
}

const documentProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['document'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get a document with its extracted fields',
				action: 'Get a document',
				routing: {
					request: {
						method: 'GET',
						url: '=/documents/{{encodeURIComponent($parameter.documentId)}}',
					},
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List documents with their extracted fields, newest first',
				action: 'Get many documents',
				routing: {
					request: { method: 'GET', url: '/documents' },
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] },
				},
			},
			{
				name: 'Parse',
				value: 'parse',
				description:
					'Send a file or text to a parser. Parsing runs in the background; use the trigger or Get for the result.',
				action: 'Parse a document',
				routing: {
					request: {
						method: 'POST',
						url: '=/parsers/{{encodeURIComponent($parameter.parserId)}}/documents',
					},
					send: { preSend: [documentBody] },
				},
			},
			{
				name: 'Review',
				value: 'review',
				description: 'Correct fields of a parsed document and/or approve it',
				action: 'Review a document',
				routing: {
					request: {
						method: 'PATCH',
						url: '=/documents/{{encodeURIComponent($parameter.documentId)}}',
					},
				},
			},
		],
		default: 'parse',
	},
	{
		displayName: 'Parser Name or ID',
		name: 'parserId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getParsers' },
		required: true,
		displayOptions: { show: forParse },
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
	},
	{
		displayName: 'Input',
		name: 'input',
		type: 'options',
		displayOptions: { show: forParse },
		options: [
			{
				name: 'File',
				value: 'file',
				description: 'A PDF, image, .eml or text file from an earlier node',
			},
			{ name: 'Text', value: 'text', description: 'An email body or any text' },
		],
		default: 'file',
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		displayOptions: { show: { ...forParse, input: ['file'] } },
		default: 'data',
		hint: 'The name of the input binary field containing the file',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		required: true,
		typeOptions: { rows: 6 },
		displayOptions: { show: { ...forParse, input: ['text'] } },
		default: '',
		description: 'Every 3,000 characters count as a page',
	},
	{
		displayName: 'Document ID',
		name: 'documentId',
		type: 'number',
		required: true,
		displayOptions: { show: forGet },
		default: 0,
		description: 'The Pluckbox document ID, for example from Parse or the trigger',
	},
	{
		displayName: 'Approve',
		name: 'approve',
		type: 'boolean',
		displayOptions: { show: forReview },
		default: true,
		description: 'Whether to accept the remaining fields as they are',
		routing: { send: { type: 'body', property: 'approve' } },
	},
	{
		displayName: 'Corrections (JSON)',
		name: 'data',
		type: 'json',
		displayOptions: { show: forReview },
		default: '{}',
		description:
			'Fields to correct, as an object of field name to value, for example {"total": 120}',
		routing: { send: { type: 'body', property: 'data', value: '={{JSON.parse($value || "{}")}}' } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		displayOptions: { show: forGetMany },
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		routing: {
			send: { paginate: '={{ $value }}' },
			operations: {
				pagination: {
					type: 'offset',
					properties: {
						limitParameter: 'limit',
						offsetParameter: 'offset',
						pageSize: 50,
						type: 'query',
					},
				},
			},
		},
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		displayOptions: { show: { ...forGetMany, returnAll: [false] } },
		typeOptions: { minValue: 1, maxValue: 200 },
		default: 50,
		description: 'Max number of results to return',
		routing: { send: { type: 'query', property: 'limit' }, output: { maxResults: '={{$value}}' } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		displayOptions: { show: forGetMany },
		default: {},
		options: [
			{
				displayName: 'Created Since',
				name: 'since',
				type: 'dateTime',
				default: '',
				routing: qs('since'),
			},
			{
				displayName: 'Parser Name or ID',
				name: 'parser',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getParsers' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				routing: qs('parser'),
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Failed', value: 'failed' },
					{ name: 'Needs Review', value: 'needs_review' },
					{ name: 'Parsed', value: 'parsed' },
					{ name: 'Processing', value: 'processing' },
					{ name: 'Queued', value: 'queued' },
				],
				default: 'parsed',
				routing: qs('status'),
			},
		],
	},
];

const parserProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['parser'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List parsers with their fields and inbound email addresses',
				action: 'Get many parsers',
				routing: {
					request: { method: 'GET', url: '/parsers' },
					output: { postReceive: [{ type: 'rootProperty', properties: { property: 'data' } }] },
				},
			},
		],
		default: 'getAll',
	},
];

export class Pluckbox implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Pluckbox',
		name: 'pluckbox',
		icon: { light: 'file:../../icons/pluckbox.svg', dark: 'file:../../icons/pluckbox.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Pull the fields you define out of PDFs, images and emails with AI',
		defaults: { name: 'Pluckbox' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'pluckboxApi', required: true }],
		requestDefaults: {
			baseURL: 'https://pluckbox.onibaku.co.uk/v1',
			headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Document', value: 'document' },
					{ name: 'Parser', value: 'parser' },
				],
				default: 'document',
			},
			...documentProperties,
			...parserProperties,
		],
	};

	methods = { loadOptions: { getParsers } };
}
