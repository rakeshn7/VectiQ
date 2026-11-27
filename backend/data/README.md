# VectiQ Reference Semantic Dataset

## Overview

`corpus.csv` contains **360 curated, unique synthetic English sentences** (`corp_001` through `corp_360`) created specifically for local semantic space visualization, nearest-neighbor retrieval, and contrastive vector steering in **VectiQ**.

> **Data Provenance Note:** These sentences are synthetically authored reference examples designed to provide clean semantic variety and balanced contrastive poles across concepts. They are **not** real-world user data.

## Categories

The corpus is balanced evenly across 6 semantic categories (60 sentences per category), stored in round-robin interleaved order so prefix slices (such as the default `limit=250` map view) retain balanced coverage across every cluster:

| Category | Label | Count |
| --- | --- | --- |
| `sentiment` | Sentiment Domain | 60 |
| `technical` | Engineering & Computing | 60 |
| `formal` | Corporate & Legal | 60 |
| `casual` | Casual & Everyday | 60 |
| `education` | Education & Research | 60 |
| `business` | Business & Strategy | 60 |

## Contrastive Concept Anchors

Each supported steering concept uses balanced `positive` and `negative` anchor examples embedded inside `corpus.csv` via dedicated anchor columns (`sentiment_anchor`, `technical_anchor`, `formal_anchor`):

- **`positive_sentiment`:** 30 positive emotional/evaluative sentences vs. 30 negative emotional/evaluative sentences.
- **`technical_tone`:** 30 rigorous engineering/scientific formulations vs. 30 plain/colloquial explanations.
- **`formal_tone`:** 30 executive/legal/formal statements vs. 30 casual/conversational statements.

Concept direction vectors are computed dynamically from actual `sentence-transformers/all-MiniLM-L6-v2` embeddings as:

$$D = \text{normalize}(\text{mean}(P) - \text{mean}(N))$$

