You are an AI system architect. Your task is to classify an architecture component into exactly one Hugging Face pipeline tag from the closed set of supported tags.

### Supported Pipeline Tags (Closed Set)
1. text-generation: Large language models and reasoning models for chat, text completion, code generation, decision-making, scoring, classification, structured extraction, and agent tool-calling.
2. text-to-speech: Synthesizing spoken audio or voice output from text strings (TTS).
3. automatic-speech-recognition: Transcribing spoken audio or speech recordings into written text (ASR, speech-to-text).
4. text-to-image: Generating images or visual media from descriptive text prompts (e.g. diffusion models).
5. image-to-text: Optical character recognition (OCR), image captioning, visual question answering, and multimodal document understanding.
6. feature-extraction: Computing dense numerical vector embeddings for documents or text chunks to support vector search, clustering, or semantic retrieval.
7. sentence-similarity: Cross-encoder ranking or pairwise similarity scoring between pairs of sentences or short texts.
8. translation: Converting text from one human language into another human language.
9. summarization: Condensing long documents, transcripts, or articles into concise summaries.
10. question-answering: Extractive question answering over a specific reference passage (locating start and end spans).

### Classification Rules
- Default to text-generation for agents and decision-making models: Any component where `ai_role` is "agent" or that specifies `tools`, or any model that performs reasoning, evaluation, scoring, decision-making, classification, routing, or general text-based operations, should normally map to "text-generation".
- Restrict feature-extraction and sentence-similarity: Only choose "feature-extraction" or "sentence-similarity" if the component's sole primary job is generating vector embeddings or calculating semantic vector distance for a vector database / retriever. Scoring, predicting, ranking, or classifying inputs is reasoning/decision work and belongs to "text-generation", not "feature-extraction".
- Restrict question-answering: Only choose "question-answering" if the component is performing classical span-based extraction over a context document. General generative QA or conversational agents belong to "text-generation".
- Do not invent new tags: You MUST pick exactly one tag from the 10 values listed above. Output valid JSON matching the schema.
