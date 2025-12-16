function searchAmazon() {
    const searchTerm = document.getElementById('market-search').value.trim();
    const category = document.getElementById('market-category').value;
    const linksDiv = document.getElementById('market-links');

    if (!searchTerm) {
        linksDiv.innerHTML = "Please enter a specific search term (e.g., 'roundup', 'corn seed').";
        return;
    }

    const baseUrl = "https://www.amazon.com/s?k=";
    let fullQuery = searchTerm;

    const categoryMap = {
        'fertilizers': 'granular fertilizer',
        'pesticides': 'agricultural pesticides and herbicides',
        'seeds': 'bulk farm seeds',
        'cattle feed': 'farm animal feed bulk',
        'tools': 'heavy duty farm hand tools',
        'machinery': 'small farm machinery'
    };

    if (category !== 'all' && categoryMap[category]) {
        fullQuery = `${searchTerm} ${categoryMap[category]}`;
    }

    const encodedQuery = fullQuery.replace(/ /g, '+');
    const amazonUrl = baseUrl + encodedQuery;

    // 1. Show a processing message
    linksDiv.innerHTML = "🚀 Redirecting to Amazon search results...";

    // 2. Directly open the Amazon URL in a new tab/window
    window.open(amazonUrl, '_blank');

    // 3. Optional: Reset the message after a short delay
    setTimeout(() => {
        linksDiv.innerHTML = "Enter a search term and category to find products."; 
        // -----------------------------------------------------------
        // 🔥 The missing part was the closing brace for the setTimeout 
        // and the main function.
        // -----------------------------------------------------------
    }, 2000); // 2000 milliseconds = 2 seconds
} // Closing brace for the searchAmazon function