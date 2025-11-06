/**
 * PheNo Branding Script
 * Removes the OpenSILEX text element to let the full logo shine
 */

(function() {
    'use strict';

    // Function to remove/hide text elements in navbar
    function hideNavbarText() {
        // Target all text elements in header-brand
        const textElements = document.querySelectorAll(
            '.header-brand .text, ' +
            '.header-brand span.text, ' +
            '[data-v-5d66e734].text, ' +
            'span.text[data-v-5d66e734]'
        );

        textElements.forEach(function(element) {
            // Completely remove the element from DOM
            if (element.textContent.includes('OpenSILEX') || element.textContent.includes('PheNo')) {
                element.style.display = 'none';
                element.style.visibility = 'hidden';
                element.style.opacity = '0';
                element.style.width = '0';
                element.style.height = '0';
                element.style.margin = '0';
                element.style.padding = '0';
                element.style.position = 'absolute';
                element.style.left = '-9999px';

                // Also try to remove it completely
                // element.remove(); // Uncomment if needed
            }
        });

        // Ensure logo is properly sized
        const logoElements = document.querySelectorAll(
            '.header-brand .logo-img, ' +
            '.logo-img[data-v-5d66e734], ' +
            'img.logo-img'
        );

        logoElements.forEach(function(logo) {
            // Override OpenSILEX's max-width: 42px constraint
            logo.style.maxWidth = 'none';
            logo.style.width = '140px';
            logo.style.minWidth = '120px';
            logo.style.height = 'auto';
            logo.style.maxHeight = '45px';
            logo.style.minHeight = '35px';
            logo.style.objectFit = 'contain';
            logo.style.margin = '0';
            logo.style.padding = '0';
            // Override positioning constraints
            logo.style.position = 'static';
            logo.style.top = 'auto';
            logo.style.transform = 'none';
        });
    }

    // Run immediately
    hideNavbarText();

    // Run after DOM is fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', hideNavbarText);
    } else {
        hideNavbarText();
    }

    // Run after delays to catch dynamically loaded content
    setTimeout(hideNavbarText, 50);
    setTimeout(hideNavbarText, 100);
    setTimeout(hideNavbarText, 250);
    setTimeout(hideNavbarText, 500);
    setTimeout(hideNavbarText, 1000);
    setTimeout(hideNavbarText, 2000);

    // Use MutationObserver to watch for dynamic changes
    const observer = new MutationObserver(function(mutations) {
        hideNavbarText();
    });

    // Start observing when the app div is available
    const startObserving = function() {
        const appElement = document.getElementById('app');
        if (appElement) {
            observer.observe(appElement, {
                childList: true,
                subtree: true,
                attributes: true
            });
            hideNavbarText(); // Run once more after observer starts
        } else {
            // If app element not found, try again
            setTimeout(startObserving, 100);
        }
    };

    startObserving();

    // Also run on window load as a final catch
    window.addEventListener('load', function() {
        setTimeout(hideNavbarText, 100);
        setTimeout(hideNavbarText, 500);
    });
})();
