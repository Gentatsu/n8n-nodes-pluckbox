import type { ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

export async function getParsers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'pluckboxApi', {
		url: 'https://pluckbox.onibaku.co.uk/v1/parsers',
		json: true,
	})) as { data: Array<{ id: number; name: string }> };
	return response.data.map((parser) => ({ name: parser.name, value: parser.id }));
}
