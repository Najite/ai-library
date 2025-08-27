// src/services/bookService.ts
import axios from 'axios';
import { Book, SearchResult } from '../types';
import { getAIRecommendations } from './aiService';

// Google Programmable Search Engine API configuration
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;
const GOOGLE_CX = import.meta.env.VITE_GOOGLE_CX; // Programmable Search Engine ID

/* ------------------------------------------------------------------ */
/* Open Library API for book covers and metadata                     */
/* ------------------------------------------------------------------ */
const fetchBookCoverFromOpenLibrary = async (title: string, author: string): Promise<string | undefined> => {
  try {
    // Clean title and author for search
    const cleanTitle = title.replace(/[^\w\s]/g, '').trim().toLowerCase();
    const cleanAuthor = author.replace(/[^\w\s]/g, '').trim().toLowerCase();
    
    // Search Open Library for the book
    const searchQuery = `title:"${cleanTitle}" author:"${cleanAuthor}"`;
    console.log(`Searching Open Library for: ${searchQuery}`);
    
    const { data } = await axios.get('https://openlibrary.org/search.json', {
      params: {
        q: searchQuery,
        limit: 5,
        fields: 'key,title,author_name,cover_i,isbn,edition_count'
      },
      timeout: 10000
    });

    if (data.docs && data.docs.length > 0) {
      // Try to find a book with a cover
      for (const book of data.docs) {
        if (book.cover_i) {
          const coverUrl = `https://covers.openlibrary.org/b/id/${book.cover_i}-L.jpg`;
          console.log(`Found cover for "${title}": ${coverUrl}`);
          return coverUrl;
        }
      }
      
      // If no cover found in search results, try with ISBN if available
      const bookWithIsbn = data.docs.find(book => book.isbn && book.isbn.length > 0);
      if (bookWithIsbn && bookWithIsbn.isbn) {
        const isbn = bookWithIsbn.isbn[0];
        const coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
        console.log(`Trying ISBN cover for "${title}": ${coverUrl}`);
        
        // Verify the cover exists by making a HEAD request
        try {
          await axios.head(coverUrl, { timeout: 5000 });
          return coverUrl;
        } catch {
          console.log(`ISBN cover not available for "${title}"`);
        }
      }
    }

    console.log(`No cover found in Open Library for "${title}"`);
    return undefined;
  } catch (error) {
    console.error(`Open Library search error for "${title}":`, error.message);
    return undefined;
  }
};

/* ------------------------------------------------------------------ */
/* Alternative cover sources                                          */
/* ------------------------------------------------------------------ */
const fetchBookCoverFromGoogleBooks = async (title: string, author: string): Promise<string | undefined> => {
  try {
    const query = `intitle:"${title}" inauthor:"${author}"`;
    console.log(`Searching Google Books API for cover: ${query}`);
    
    const { data } = await axios.get('https://www.googleapis.com/books/v1/volumes', {
      params: {
        q: query,
        maxResults: 5,
        printType: 'books'
      },
      timeout: 10000
    });

    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.volumeInfo?.imageLinks?.large) {
          console.log(`Found large cover from Google Books for "${title}"`);
          return item.volumeInfo.imageLinks.large;
        }
        if (item.volumeInfo?.imageLinks?.medium) {
          console.log(`Found medium cover from Google Books for "${title}"`);
          return item.volumeInfo.imageLinks.medium;
        }
        if (item.volumeInfo?.imageLinks?.thumbnail) {
          console.log(`Found thumbnail cover from Google Books for "${title}"`);
          return item.volumeInfo.imageLinks.thumbnail;
        }
      }
    }

    console.log(`No cover found in Google Books for "${title}"`);
    return undefined;
  } catch (error) {
    console.error(`Google Books API error for "${title}":`, error.message);
    return undefined;
  }
};

/* ------------------------------------------------------------------ */
/* Fetch book cover with fallbacks                                   */
/* ------------------------------------------------------------------ */
const fetchBookCover = async (title: string, author: string): Promise<string> => {
  // Try Open Library first (free, no API key required)
  let coverUrl = await fetchBookCoverFromOpenLibrary(title, author);
  
  // If Open Library doesn't have it, try Google Books
  if (!coverUrl) {
    coverUrl = await fetchBookCoverFromGoogleBooks(title, author);
  }
  
  // If still no cover found, return a styled placeholder
  if (!coverUrl) {
    console.log(`Using placeholder cover for "${title}"`);
    const encodedTitle = encodeURIComponent(title.substring(0, 30));
    const encodedAuthor = encodeURIComponent(author.substring(0, 20));
    return `https://via.placeholder.com/400x600/1e293b/f8fafc?text=${encodedTitle}+by+${encodedAuthor}`;
  }
  
  return coverUrl;
};

/* ------------------------------------------------------------------ */
/* Google Programmable Search Engine for PDFs                        */
/* ------------------------------------------------------------------ */
const searchGoogleForPDF = async (bookTitle: string, author: string): Promise<string | undefined> => {
  try {
    // Validate API credentials
    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
      console.warn('Google Programmable Search Engine API credentials not configured');
      return undefined;
    }

    // Clean and create search query specifically for PDFs
    const cleanTitle = bookTitle.replace(/[^\w\s]/g, '').trim();
    const cleanAuthor = author.replace(/[^\w\s]/g, '').trim();
    
    // Create a focused search query for PDF files
    const query = `"${cleanTitle}" "${cleanAuthor}" filetype:pdf`;
    
    console.log(`Searching Google PSE for: "${query}"`);
    
    const { data } = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: {
        key: GOOGLE_API_KEY,
        cx: GOOGLE_CX,
        q: query,
        num: 5, // Get more results to find valid PDFs
        safe: 'off', // Allow all content
        exactTerms: cleanTitle // Ensure title is included
      },
      timeout: 15000 // 15 second timeout
    });

    console.log(`Google PSE response for "${bookTitle}":`, data);

    // Find PDF links from the results
    if (data.items && data.items.length > 0) {
      for (const item of data.items) {
        if (item.link && item.link.toLowerCase().endsWith('.pdf')) {
          console.log(`Found PDF for "${bookTitle}": ${item.link}`);
          return item.link;
        }
        
        // Also check if the link contains PDF indicators
        if (item.link && (
          item.link.toLowerCase().includes('.pdf') ||
          item.displayLink?.toLowerCase().includes('pdf') ||
          item.snippet?.toLowerCase().includes('pdf')
        )) {
          console.log(`Found potential PDF for "${bookTitle}": ${item.link}`);
          return item.link;
        }
      }
    }

    console.log(`No PDF found for "${bookTitle}"`);
    return undefined;
  } catch (error) {
    console.error(`Google PSE search error for "${bookTitle}":`, {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    return undefined;
  }
};

/* ------------------------------------------------------------------ */
/* AI Recommendation to Book conversion with PDF search              */
/* ------------------------------------------------------------------ */
const convertAIRecommendationToBook = async (
  recommendation: string, 
  index: number, 
  originalQuery: string
): Promise<Book> => {
  // Parse "Title by Author" format
  const titleAuthorMatch = recommendation.match(/^(.*?)\s+by\s+(.*)$/i);
  const title = titleAuthorMatch ? titleAuthorMatch[1].trim() : recommendation;
  const authorString = titleAuthorMatch ? titleAuthorMatch[2].trim() : 'Unknown Author';
  const author = authorString.split(',').map(a => a.trim());
  
  // Search for both PDF download link and book cover concurrently
  const [downloadUrl, coverUrl] = await Promise.all([
    searchGoogleForPDF(title, authorString),
    fetchBookCover(title, authorString)
  ]);
  
  return {
    id: `ai-rec-${index}`,
    title,
    author,
    subjects: [`AI recommended for: ${originalQuery}`],
    source: 'ai-recommendation' as const,
    isAIRecommendation: true,
    downloadUrl, // Will be undefined if no PDF found
    coverUrl // Real cover from Open Library/Google Books or styled placeholder
  };
};

/* ------------------------------------------------------------------ */
/* AI book search with Google Programmable Search Engine PDF lookup  */
/* ------------------------------------------------------------------ */
export const searchBooks = async (query: string): Promise<SearchResult> => {
  try {
    // Get AI recommendations
    const aiData = await getAIRecommendations(query);
    
    // Convert AI recommendations to Book objects with PDF search and real covers
    const aiBooks = await Promise.all(
      aiData.recommendations.map((rec, index) => 
        convertAIRecommendationToBook(rec, index, query)
      )
    );

    // Separate books with and without PDFs
    const booksWithPDFs = aiBooks.filter(book => book.downloadUrl);
    const booksWithoutPDFs = aiBooks.filter(book => !book.downloadUrl);

    // Return all books but mark which ones have PDFs
    const allBooks = [...booksWithPDFs, ...booksWithoutPDFs];

    return {
      books: allBooks,
      totalResults: allBooks.length,
      query,
      enhancedQuery: aiData.enhancedQuery,
      searchTerms: aiData.searchTerms,
      aiRecommendationsCount: aiBooks.length,
      pdfFoundCount: booksWithPDFs.length,
      booksWithoutPDFs: booksWithoutPDFs.length
    };

  } catch (error) {
    console.error('AI search error:', error);
    
    // Return empty result if AI fails
    return {
      books: [],
      totalResults: 0,
      query,
      aiRecommendationsCount: 0,
      pdfFoundCount: 0
    };
  }
};