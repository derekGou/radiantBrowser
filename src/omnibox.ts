import { v4 as uuid } from 'uuid'

type OmniboxSuggestion = {
    id: string
    type: 'url' | 'search' | 'history' | 'bookmark'
    title: string
    subtitle?: string
    value: string   // what navigating uses
}

export async function getOmniboxSuggestions(
    input: string,
    history: { url: string; title: string }[],
    bookmarks: { url: string; title: string }[]
) {
    const value = input.trim().toLowerCase()

    const res = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(input)}`)
    const data = await res.json()
    const results: OmniboxSuggestion[] = data[1].map((s: string) => ({
        id: s,
        type: 'search',
        title: s,
        value: s,
    }))

    // 2. History
    for (const h of history) {
        if (h.url.includes(value) || h.title.toLowerCase().includes(value)) {
            results.push({
                id: uuid(),
                type: 'history',
                title: h.title,
                subtitle: h.url,
                value: h.url
            })
        }
    }

    // 3. Bookmarks
    for (const b of bookmarks) {
        if (b.url.includes(value) || b.title.toLowerCase().includes(value)) {
            results.push({
                id: uuid(),
                type: 'bookmark',
                title: b.title,
                subtitle: b.url,
                value: b.url
            })
        }
    }

    return results.slice(0, 8)
}