# n8n-nodes-pluckbox

n8n nodes for [Pluckbox](https://pluckbox.onibaku.co.uk), which pulls the fields you define out of PDFs, images and emails (invoices, receipts, orders, leads) with AI, each with a confidence score.

[Installation](#installation) · [Operations](#operations) · [Credentials](#credentials) · [Example](#example) · [Resources](#resources)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) and install `n8n-nodes-pluckbox`.

## Operations

**Pluckbox Trigger**

- Document parsed, failed or reviewed: starts the workflow once per document, with every extracted field under `data`. Optional parser filter. n8n registers the webhook in Pluckbox when you activate the workflow and removes it when you deactivate it. Each delivery is checked against its `Pluckbox-Signature`.

**Pluckbox**

- Document, Parse: send a file from an earlier node (PDF, PNG, JPEG, GIF, WebP, .eml or text) or some text to a parser. Parsing runs in the background, usually in a few seconds; use the trigger or Get for the result.
- Document, Get: one document with its extracted fields, confidence per field and low-confidence fields.
- Document, Get Many: documents, newest first, by parser, status or date. Pages through results with Return All.
- Document, Review: correct fields and/or approve a document that needs review.
- Parser, Get Many: parsers with their fields and inbound email addresses.

The Pluckbox node can be used as a tool by n8n's AI Agent. For any other endpoint, use the HTTP Request node with the predefined **Pluckbox API** credential. See the [API reference](https://pluckbox.onibaku.co.uk/docs).

## Credentials

In Pluckbox, open API keys and create a key (sign-up gives you a first one). Paste it into the **Pluckbox API** credential in n8n. The trigger needs the `webhooks:write` scope; Parse and Review need `documents:write`.

## Example

Gmail Trigger (with attachments) → Pluckbox, Document, Parse (parser "Supplier invoices"). Then Pluckbox Trigger (Document Parsed) → Google Sheets, appending `data.invoice_number`, `data.total` and `data.due_date`, and → Slack when `needsReview` is true.

## Compatibility

Tested with n8n 2.x.

## Resources

- [Pluckbox API reference](https://pluckbox.onibaku.co.uk/docs)
- [n8n community nodes](https://docs.n8n.io/integrations/#community-nodes)

## Licence

[MIT](LICENSE.md)
