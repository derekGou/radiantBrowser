import { useEffect, useState } from "react";

type HistoryEntry = {
    tabId: string;
    tabTitle: string;
    index: number;
    url: string;
    title?: string;
    timestamp: number;
    isActive: boolean;
    dbId?: number;
};

export default function History(){
    const [entries, setEntries] = useState<HistoryEntry[]>([]);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
    const [deleteConfirmTabId, setDeleteConfirmTabId] = useState<string>('');
    const [showClearConfirm, setShowClearConfirm] = useState<'day' | 'week' | 'month' | 'year' | 'all' | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    const loadHistory = async () => {
        try {
            setIsLoading(true);
            if (!window.tabHistory?.get) {
                console.error('tabHistory API not available');
                setEntries([]);
                return;
            }
            const data = await window.tabHistory.get();
            setEntries(data?.entries || []);
        } catch (error) {
            console.error('Failed to load history:', error);
            setEntries([]);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadHistory();
    }, []);

    const handleNavigate = async (url: string) => {
        await window.tabHistory.goToEntry(url);
        await loadHistory();
    };

    const handleDeleteEntry = async (dbId: number, tabId: string) => {
        try {
            await window.tabHistory.deleteEntry(dbId);
            await loadHistory();
            setShowDeleteConfirm(null);
            setDeleteConfirmTabId('');
        } catch (error) {
            console.error('Failed to delete entry:', error);
            alert('Failed to delete history entry');
        }
    };

    const handleClearByPeriod = async (period: 'day' | 'week' | 'month' | 'year' | 'all') => {
        await window.tabHistory.clearByPeriod(period);
        await loadHistory();
        setShowClearConfirm(null);
    };

    const getPeriodLabel = (period: string) => {
        const labels: Record<string, string> = {
            'day': 'Past Day',
            'week': 'Past Week',
            'month': 'Past Month',
            'year': 'Past Year',
            'all': 'All Time'
        };
        return labels[period] || period;
    };

    return (
        <div className="w-full h-full p-6 text-white flex flex-col">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl">History</h1>
            </div>

            {/* Clear History Section */}
            <div className="mb-6 p-4 bg-[#fff1] rounded-lg">
                <h2 className="text-sm uppercase tracking-wide text-white/80 mb-3">Clear History</h2>
                <div className="flex flex-wrap gap-2">
                    {(['day', 'week', 'month', 'year', 'all'] as const).map((period) => (
                        <button
                            key={period}
                            onClick={() => setShowClearConfirm(period)}
                            className="px-3 py-2 text-sm bg-[#ff6b6b]/20 hover:bg-[#ff6b6b]/30 text-[#ff6b6b] rounded transition-colors"
                        >
                            {getPeriodLabel(period)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm !== null && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-[#1a1a1a] p-6 rounded-lg max-w-sm">
                        <h3 className="text-lg font-semibold mb-4">Delete History Entry?</h3>
                        <p className="text-white/70 mb-6 text-sm">This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowDeleteConfirm(null);
                                    setDeleteConfirmTabId('');
                                }}
                                className="flex-1 px-4 py-2 bg-[#fff2] hover:bg-[#fff3] rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => showDeleteConfirm !== null && handleDeleteEntry(showDeleteConfirm, deleteConfirmTabId)}
                                className="flex-1 px-4 py-2 bg-[#ff6b6b] hover:bg-[#ff5252] text-white rounded transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear History Confirmation Modal */}
            {showClearConfirm && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                    <div className="bg-[#1a1a1a] p-6 rounded-lg max-w-sm">
                        <h3 className="text-lg font-semibold mb-4">Clear {getPeriodLabel(showClearConfirm)} History?</h3>
                        <p className="text-white/70 mb-6 text-sm">This will permanently delete all history entries from the {getPeriodLabel(showClearConfirm).toLowerCase()}. This action cannot be undone.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowClearConfirm(null)}
                                className="flex-1 px-4 py-2 bg-[#fff2] hover:bg-[#fff3] rounded transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleClearByPeriod(showClearConfirm)}
                                className="flex-1 px-4 py-2 bg-[#ff6b6b] hover:bg-[#ff5252] text-white rounded transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* History Entries */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="text-white/60 text-center py-8">Loading history...</div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {entries
                            .slice()
                            .sort((a, b) => b.timestamp - a.timestamp)
                            .map((entry, index, list) => {
                                const entryDate = new Date(entry.timestamp).toDateString()
                                const prevDate = index > 0 ? new Date(list[index - 1].timestamp).toDateString() : null
                                const showSeparator = entryDate !== prevDate

                                return (
                                    <div key={`${entry.tabId}-${entry.url}-${index}`} className="flex flex-col gap-2">
                                        {showSeparator && (
                                            <div className="text-xs uppercase tracking-wide text-white/60 pt-2">
                                                {entryDate}
                                            </div>
                                        )}
                                        <div className="flex gap-2 items-stretch">
                                            <button
                                                className={`flex-1 text-left p-3 rounded ${entry.isActive ? 'bg-[#fff2]' : 'bg-[#fff1]'} hover:bg-[#fff3] transition-colors`}
                                                onClick={() => handleNavigate(entry.url)}
                                            >
                                                <div className="text-base">{entry.title ?? entry.url}</div>
                                                <div className="text-sm opacity-80 break-all">{entry.url}</div>
                                                <div className="flex justify-between items-center mt-1">
                                                    <div className="text-xs uppercase tracking-wide text-white/60">{entry.tabTitle}</div>
                                                    <div className="text-xs text-white/50">{new Date(entry.timestamp).toLocaleTimeString()}</div>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => {

                                                    if (entry.dbId !== undefined && entry.dbId !== null) {
                                                        setShowDeleteConfirm(entry.dbId);
                                                        setDeleteConfirmTabId(entry.tabId);
                                                    } else {
                                                        alert('Cannot delete: This entry has not been saved to the database yet. Try refreshing the history page.');
                                                    }
                                                }}
                                                className={`px-3 py-3 rounded flex-shrink-0 transition-colors ${
                                                    (entry.dbId !== undefined && entry.dbId !== null)
                                                        ? 'bg-[#ff6b6b]/10 hover:bg-[#ff6b6b]/20 text-[#ff6b6b] hover:text-[#ff5252]'
                                                        : 'bg-[#fff1] text-white/30 cursor-not-allowed'
                                                }`}
                                                title={entry.dbId ? "Delete this entry" : "Entry not yet saved to database"}
                                            >
                                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                                                    <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )
                            })}
                        {entries.length === 0 && (
                            <div className="text-white/60">No history yet.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}