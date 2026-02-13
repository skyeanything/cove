---
name: web-research
description: Guides the agent to perform thorough web research by searching, fetching, and synthesizing information from multiple sources.
emoji: "\U0001F50D"
always: false
requires:
  tools:
    - bash
---

# Web Research Skill

When performing web research, follow these best practices:

## Strategy
1. **Start broad**: Begin with a general search query to understand the landscape.
2. **Refine**: Use initial results to form more specific follow-up queries.
3. **Cross-reference**: Verify important facts across multiple sources.
4. **Fetch details**: When a search result looks promising, use `curl` to get the full content.

## Guidelines
- Always cite your sources with URLs when presenting findings.
- Prefer recent sources over older ones for time-sensitive topics.
- If search results are insufficient, try rephrasing the query.
- Summarize findings concisely — don't dump raw fetched content.
- When fetching pages, focus on extracting the relevant sections rather than presenting everything.

## Error Handling
- If a search returns no results, try broader or alternative terms.
- If a URL fails to fetch with `curl`, note this and try alternative sources.
- Always provide the best answer you can, even with limited results.
