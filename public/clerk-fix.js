// Clerk modal fix
document.addEventListener('DOMContentLoaded', () => {
  // Wait for Clerk to load
  const checkClerk = setInterval(() => {
    if (window.Clerk) {
      clearInterval(checkClerk);
      console.log("Clerk fix: Clerk loaded, applying fixes");
      
      // Function to fix modal positioning
      function fixModalPositioning() {
        // Find the modal elements
        const modal = document.querySelector('.cl-modal');
        const card = document.querySelector('.cl-card');
        const cardRoot = document.querySelector('.cl-card-root');
        const socialButtons = document.querySelectorAll('.cl-socialButtonsIconButton');
        const socialButtonsBlock = document.querySelector('.cl-socialButtonsBlock');
        const formControls = document.querySelectorAll('.cl-form-control');
        const formButtons = document.querySelectorAll('.cl-formButtonPrimary');
        
        // Fix modal positioning
        if (modal) {
          modal.style.display = 'flex';
          modal.style.alignItems = 'center';
          modal.style.justifyContent = 'center';
          modal.style.height = '100%';
          modal.style.width = '100%';
          modal.style.maxWidth = '100%';
          modal.style.padding = '1rem';
        }
        
        // Fix card positioning
        if (card) {
          card.style.margin = 'auto';
          card.style.position = 'relative';
          card.style.top = '0';
          card.style.transform = 'none';
          card.style.width = '100%';
          card.style.maxWidth = '450px';
          card.style.minWidth = '320px';
        }
        
        // Fix card root positioning
        if (cardRoot) {
          cardRoot.style.position = 'relative';
          cardRoot.style.top = '0';
          cardRoot.style.transform = 'none';
          cardRoot.style.margin = 'auto';
          cardRoot.style.width = '100%';
          cardRoot.style.maxWidth = '450px';
          cardRoot.style.minWidth = '320px';
        }
        
        // Fix social buttons
        socialButtons.forEach(button => {
          button.style.width = '100%';
          button.style.maxWidth = '100%';
        });
        
        // Fix social buttons block
        if (socialButtonsBlock) {
          socialButtonsBlock.style.width = '100%';
          socialButtonsBlock.style.maxWidth = '100%';
        }
        
        // Fix form controls
        formControls.forEach(control => {
          control.style.width = '100%';
        });
        
        // Fix form buttons
        formButtons.forEach(button => {
          button.style.width = '100%';
        });
      }
      
      // Override Clerk's openSignIn and openSignUp methods
      const originalOpenSignIn = window.Clerk.openSignIn;
      const originalOpenSignUp = window.Clerk.openSignUp;
      const originalCloseSignIn = window.Clerk.closeSignIn;
      const originalCloseSignUp = window.Clerk.closeSignUp;
      
      window.Clerk.openSignIn = function(options) {
        // Add class to body when modal is open
        document.body.classList.add('clerk-modal-open');
        console.log("Clerk fix: Added clerk-modal-open class to body");
        
        // Hide any existing modals
        const existingModals = document.querySelectorAll('.modal, .bs_popup_dropzone');
        existingModals.forEach(modal => {
          if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
          }
        });
        
        // Call the original method
        const result = originalOpenSignIn.call(window.Clerk, options);
        
        // Center the modal after a short delay
        setTimeout(fixModalPositioning, 100);
        
        return result;
      };
      
      window.Clerk.openSignUp = function(options) {
        // Add class to body when modal is open
        document.body.classList.add('clerk-modal-open');
        console.log("Clerk fix: Added clerk-modal-open class to body");
        
        // Hide any existing modals
        const existingModals = document.querySelectorAll('.modal, .bs_popup_dropzone');
        existingModals.forEach(modal => {
          if (modal && !modal.classList.contains('hidden')) {
            modal.classList.add('hidden');
          }
        });
        
        // Call the original method
        const result = originalOpenSignUp.call(window.Clerk, options);
        
        // Center the modal after a short delay
        setTimeout(fixModalPositioning, 100);
        
        return result;
      };
      
      // Override close methods if they exist
      if (typeof originalCloseSignIn === 'function') {
        window.Clerk.closeSignIn = function() {
          document.body.classList.remove('clerk-modal-open');
          console.log("Clerk fix: Removed clerk-modal-open class from body");
          return originalCloseSignIn.call(window.Clerk);
        };
      }
      
      if (typeof originalCloseSignUp === 'function') {
        window.Clerk.closeSignUp = function() {
          document.body.classList.remove('clerk-modal-open');
          console.log("Clerk fix: Removed clerk-modal-open class from body");
          return originalCloseSignUp.call(window.Clerk);
        };
      }
      
      // Listen for auth state changes
      window.Clerk.addListener(({ user, session, client }) => {
        // Remove class from body when modal is closed
        if (!document.querySelector('.cl-modal, .cl-component-overlay')) {
          document.body.classList.remove('clerk-modal-open');
          console.log("Clerk fix: Removed clerk-modal-open class from body (auth state change)");
        }
      });
      
      // Add a mutation observer to detect when Clerk modal is added to DOM
      const bodyObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // Check if any Clerk components were added
            const hasAddedClerkComponents = Array.from(mutation.addedNodes).some(node => {
              return node.nodeType === 1 && 
                    (node.classList?.contains('cl-component') || 
                     node.classList?.contains('cl-rootBox') ||
                     node.classList?.contains('cl-modal') ||
                     node.classList?.contains('cl-card'));
            });
            
            // If Clerk components were added, center the modal
            if (hasAddedClerkComponents) {
              setTimeout(fixModalPositioning, 100);
            }
          }
          
          if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
            // Check if any Clerk components were removed
            const hasRemovedClerkComponents = Array.from(mutation.removedNodes).some(node => {
              return node.nodeType === 1 && 
                    (node.classList?.contains('cl-component') || 
                     node.classList?.contains('cl-rootBox') ||
                     node.classList?.contains('cl-modal'));
            });
            
            // If Clerk components were removed and no modal is visible, remove the class
            if (hasRemovedClerkComponents && !document.querySelector('.cl-modal, .cl-component-overlay')) {
              document.body.classList.remove('clerk-modal-open');
              console.log("Clerk fix: Removed clerk-modal-open class from body (mutation observer)");
              
              // Also remove any inert attributes that might be lingering
              document.querySelectorAll('[inert]').forEach(el => {
                el.removeAttribute('inert');
              });
              
              // And remove any aria-hidden attributes
              document.querySelectorAll('[aria-hidden="true"]').forEach(el => {
                if (el.classList.contains('container') || el.classList.contains('page-container')) {
                  el.removeAttribute('aria-hidden');
                }
              });
            }
          }
        });
      });
      
      // Start observing the body for added/removed nodes
      bodyObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // Add a click event listener to the document to detect clicks outside the modal
      document.addEventListener('click', (e) => {
        // If we have a clerk-modal-open class but no visible modal, remove the class
        if (document.body.classList.contains('clerk-modal-open') && 
            !document.querySelector('.cl-modal, .cl-component-overlay')) {
          document.body.classList.remove('clerk-modal-open');
          console.log("Clerk fix: Removed clerk-modal-open class from body (click event)");
          
          // Also remove any inert attributes
          document.querySelectorAll('[inert]').forEach(el => {
            el.removeAttribute('inert');
          });
        }
      });
      
      // Add ESC key handler to remove the class when ESC is pressed
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && document.body.classList.contains('clerk-modal-open')) {
          // Small delay to ensure Clerk has processed the ESC key first
          setTimeout(() => {
            if (!document.querySelector('.cl-modal, .cl-component-overlay')) {
              document.body.classList.remove('clerk-modal-open');
              console.log("Clerk fix: Removed clerk-modal-open class from body (ESC key)");
              
              // Also remove any inert attributes
              document.querySelectorAll('[inert]').forEach(el => {
                el.removeAttribute('inert');
              });
            }
          }, 100);
        }
      });
      
      // Apply the fix immediately if there's already a modal open
      if (document.querySelector('.cl-modal, .cl-card')) {
        fixModalPositioning();
      }
    }
  }, 100);
}); 