// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: 'Vitamem',
			description: 'Lifecycle-aware long-term memory for AI applications',
			favicon: '/brand/logo-concept-a.svg',
			social: [
				{
					icon: 'github',
					label: 'GitHub',
					href: 'https://github.com/yuw321/Vitamem',
				},
			],
			customCss: ['./src/styles/custom.css'],
			sidebar: [
				{
					label: 'Get Started',
					items: [
						{ label: 'Introduction', slug: 'introduction' },
						{ label: 'Installation', slug: 'installation' },
						{ label: 'Quickstart', slug: 'quickstart' },
						{ label: 'Tutorial: First Project', slug: 'tutorial-first-project' },
					],
				},
				{
					label: 'Concepts',
					items: [
						{ label: 'Thread Lifecycle', slug: 'concepts/thread-lifecycle' },
						{ label: 'Memory Extraction', slug: 'concepts/memory-extraction' },
						{ label: 'Deduplication', slug: 'concepts/deduplication' },
							{ label: 'Auto-Retrieve', slug: 'concepts/auto-retrieve' },
							{ label: 'Streaming Output', slug: 'concepts/streaming' },
					],
				},
				{
					label: 'Providers',
					items: [
						{ label: 'OpenAI', slug: 'providers/openai' },
						{ label: 'Anthropic', slug: 'providers/anthropic' },
						{ label: 'Ollama', slug: 'providers/ollama' },
						{ label: 'Custom LLM Adapter', slug: 'providers/custom-llm-adapter' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Integration Architecture', slug: 'guides/integration-architecture' },
						{ label: 'Health Companion', slug: 'guides/health-companion' },
						{ label: 'Health History', slug: 'guides/health-history' },
						{ label: 'Custom Storage', slug: 'guides/custom-storage' },
						{ label: 'Comparison with Alternatives', slug: 'guides/vs-alternatives' },
					],
				},
				{
					label: 'API Reference',
					items: [
						{ label: 'createVitamem', slug: 'api-reference/create-vitamem' },
						{ label: 'Types', slug: 'api-reference/types' },
						{ label: 'State Machine', slug: 'api-reference/state-machine' },
						{ label: 'Embedding Pipeline', slug: 'api-reference/embedding-pipeline' },
						{ label: 'Storage Adapter', slug: 'api-reference/storage-adapter' },
					],
				},
				{
					label: 'Troubleshooting',
					items: [
						{ label: 'Troubleshooting', slug: 'troubleshooting/troubleshooting' },
					],
				},
				{
					label: 'Legal',
					items: [
						{ label: 'Disclaimer', slug: 'legal/disclaimer' },
					],
				},
				{
					label: 'FAQ',
					items: [
						{ label: 'FAQ', slug: 'faq/faq' },
					],
				},
			],
		}),
	],
});
