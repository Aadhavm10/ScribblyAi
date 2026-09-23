'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { SearchAPI, SearchResult } from '@/lib/api';

export const dynamic = 'force-dynamic';

export default function SearchPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [selectedProviders, setSelectedProviders] = useState<string[]>(['notes', 'gmail', 'drive']);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const providers = [
    { id: 'notes', name: 'Notes', icon: '📝', color: 'blue' },
    { id: 'gmail', name: 'Gmail', icon: '✉️', color: 'red' },
    { id: 'drive', name: 'Drive', icon: '📂', color: 'yellow' },
  ];

  const toggleProvider = (providerId: string) => {
    setSelectedProviders(prev =>
      prev.includes(providerId) ? prev.filter(p => p !== providerId) : [...prev, providerId]
    );
  };

  const handleSearch = async () => {
    if (!query.trim() || !user?.id) return;

    setSearching(true);
    try {
      const searchResults = await SearchAPI.hybridSearch(query, selectedProviders);
      setResults(searchResults);
    } catch (error) {
      console.error('Search error:', error);
      alert('Search failed. Please try again.');
    } finally {
      setSearching(false);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    if (result.webViewUrl) {
      window.open(result.webViewUrl, '_blank');
    } else {
      router.push(`/notes?note=${result.noteId}`);
    }
  };

  return (
    <div className="p-8 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
            AI Search
          </h1>
          <p className="text-gray-600 dark:text-gray-400">Search across your notes, Gmail, and Drive using hybrid search</p>
        </div>

        {/* Search Input */}
        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search across all your content..."
              className="flex-1 px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold rounded-lg hover:from-indigo-700 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 disabled:cursor-not-allowed transition-all shadow-md"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </div>

        {/* Provider Filters */}
        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Filter by source:</p>
          <div className="flex gap-2 flex-wrap">
            {providers.map(provider => (
              <button
                key={provider.id}
                onClick={() => toggleProvider(provider.id)}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  selectedProviders.includes(provider.id)
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                }`}
              >
                <span className="mr-2">{provider.icon}</span>
                {provider.name}
              </button>
            ))}
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {results.length > 0 ? (
            results.map((result, idx) => (
              <div
                key={idx}
                onClick={() => handleResultClick(result)}
                className="bg-white dark:bg-gray-800 rounded-lg p-5 shadow-md hover:shadow-lg transition-all cursor-pointer border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{result.title}</h3>
                  <div className="flex items-center gap-2">
                    {result.provider && (
                      <span className="px-2 py-1 text-xs font-medium bg-indigo-100 dark:bg-indigo-900 text-indigo-800 dark:text-indigo-200 rounded">
                        {result.provider}
                      </span>
                    )}
                    {result.itemType && (
                      <span className="px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        {result.itemType}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">{result.excerpt || result.snippet}</p>
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500">
                  <span>Score: {result.score.toFixed(3)}</span>
                  {result.webViewUrl && (
                    <span className="text-indigo-600 dark:text-indigo-400">→ Open in {result.provider}</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              {searching ? 'Searching...' : 'No results yet. Try searching for something!'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

