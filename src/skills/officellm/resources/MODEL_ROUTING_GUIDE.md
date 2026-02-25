# Model Routing Guide

> **Context**: This guide supplements [AGENT_ORCHESTRATION_GUIDE.md](AGENT_ORCHESTRATION_GUIDE.md) Stage 4 (Visual Verify) with model selection strategies. OfficeLLM is a CLI tool layer and does not bind to any specific model. The agent orchestrator decides how to route visual verification based on its model stack.

## Two Patterns

### Pattern A: Single Multimodal Model (Recommended)

**Applies to**: Claude, GPT-4o, Gemini, and other natively multimodal models that accept both text and image inputs.

One model handles all five stages. At Stage 4, the same model receives `render-pages` output images and evaluates the [check items](VISUAL_QA_GUIDE.md#check-items) directly.

```
Agent (multimodal model)
  |
  |-- Stage 1: Inspect        (text)
  |-- Stage 2: Edit           (text)
  |-- Stage 3: Structural     (text)
  |-- Stage 4: Visual Verify  (text + page images)
  |-- Stage 5: Decide         (text)
```

**Advantages**:
- No inter-model handoff; simpler orchestration
- Full conversation context available during visual review
- Single API credential

### Pattern B: Text Model + Visual Model

**Applies to**: Deployments where the primary model is text-only (e.g., Qwen3-Next-80B, DeepSeek-R1) and a separate VLM handles image understanding.

The text model drives Stages 1-3 and 5. At Stage 4, it delegates to a VLM with a structured handoff payload. The VLM returns a `layout_risk` assessment that the text model incorporates into the Stage 5 decision.

```
Text Model (primary)                    VLM (visual)
  |                                       |
  |-- Stage 1: Inspect                    |
  |-- Stage 2: Edit                       |
  |-- Stage 3: Structural                 |
  |                                       |
  |-- [handoff] ---- request -----------> |
  |                                       |-- Inspect page images
  |                                       |-- Evaluate check items
  | <-------------- response ------------ |
  |                                       |
  |-- Stage 5: Decide (with VLM result)   |
```

**Advantages**:
- Use a strong text model for reasoning + a specialized VLM for vision
- Cost-effective when the text model is locally deployed
- VLM can be swapped independently

---

## Handoff Payload (Pattern B)

### Request: Text Model to VLM

```json
{
  "task": "visual_qa",
  "page_images": [
    "/tmp/qa_pages/page-1.png",
    "/tmp/qa_pages/page-2.png",
    "/tmp/qa_pages/page-3.png"
  ],
  "check_items": [
    "Pagination drift: did content shift to unexpected pages?",
    "Line-wrap overflow: do lines extend beyond the printable area?",
    "Table clipping: are table columns cut off at margins?",
    "Header/footer consistency: are headers/footers present and sequenced?",
    "Image/equation placement: are images and equations positioned correctly?"
  ],
  "context": "Inserted a 7-column data table after the 'Results' heading."
}
```

- `page_images`: Paths to rasterized pages from `render-pages` or `pdftoppm`.
- `check_items`: The five standard checks from [VISUAL_QA_GUIDE.md](VISUAL_QA_GUIDE.md#check-items).
- `context`: Brief description of the edit, so the VLM knows what to look for.

### Response: VLM to Text Model

The VLM returns a `layout_risk` object conforming to the schema in [VISUAL_QA_GUIDE.md](VISUAL_QA_GUIDE.md#layout_risk-schema):

```json
{
  "layout_risk": true,
  "risk_reason": "table_overflow_page_3",
  "visual_checks_executed": true,
  "pages_checked": 3,
  "issues_found": [
    "Table on page 3 extends beyond right margin"
  ],
  "missing_dependencies": []
}
```

The text model feeds this into the Stage 5 [decision matrix](AGENT_ORCHESTRATION_GUIDE.md#decision-matrix) to determine `pass`, `fix`, or `abort`.

---

## Decision Guide

| Condition | Recommended Pattern |
|-----------|-------------------|
| Using a multimodal API (Claude, GPT-4o, Gemini) | Pattern A |
| Locally deployed text model + available VLM | Pattern B |
| No VLM available | Skip Stage 4 (use [fallback behaviour](AGENT_ORCHESTRATION_GUIDE.md#fallback-behaviour)) |
| Cost-sensitive, high-volume batch processing | Pattern B (cheaper VLM for vision only) |

---

## Open-Source Model Reference

The following models are known to support visual understanding. This list is for reference only; OfficeLLM does not bind to any specific model.

| Model | Type | Notes |
|-------|------|-------|
| Qwen2.5-VL / Qwen3-VL | VLM | Strong document and table understanding |
| InternVL3 | VLM | Good general-purpose visual QA |
| Gemma 3 | Multimodal | Natively supports text + image (Pattern A capable) |
| Llama 4 Scout / Maverick | Multimodal | Natively multimodal; can use Pattern A |
| MiniCPM-V | VLM | Lightweight, suitable for local deployment |
| GLM-4V | VLM | Bilingual (Chinese/English) document support |

> **Note**: Model capabilities evolve rapidly. Verify current capabilities before selecting a model for production use.
