// ----------------------------------------------------
// PGit CLI Landing Page Interactive Controller
// ----------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initTerminalTabs();
  initCommandExplorer();
  initFaqAccordion();
  initCopyToClipboard();
  initScrollReveal();
});

/**
 * Hero Terminal Tab Switcher
 */
function initTerminalTabs() {
  const tabs = document.querySelectorAll('.terminal-tab');
  const screens = document.querySelectorAll('.terminal-screen');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all tabs
      tabs.forEach(t => t.classList.remove('active'));
      // Add active to clicked tab
      tab.classList.add('active');

      const targetId = `term-${tab.dataset.terminalTab}`;
      
      // Hide all screens
      screens.forEach(screen => {
        screen.classList.remove('active');
      });

      // Show targeted screen
      const activeScreen = document.getElementById(targetId);
      if (activeScreen) {
        activeScreen.classList.add('active');
      }
    });
  });
}

/**
 * Command Explorer Data & Tab Handler
 */
const COMMAND_DATABASE = {
  add: {
    title: 'pgit add &lt;paths...&gt;',
    desc: 'Tracks local project configuration paths in the PGit agent-visible private config flow. Copies the files into your private storage and sets up local safety hooks.',
    options: [
      { name: '--force', desc: 'Overwrite file mapping if the path is already tracked' },
      { name: '--no-commit', desc: 'Skip auto-commit of tracked files when deleting from Git index' },
      { name: '--no-sync-push', desc: 'Do not automatically push files to the private store after tracking' }
    ],
    example: 'pgit add .claude/ .codex/ todo.md'
  },
  push: {
    title: 'pgit push &lt;paths...&gt;',
    desc: 'Pushes specified local file modifications from the working tree into your global private store. Use "." to push all tracked paths in the current repository.',
    options: [
      { name: '--force', desc: 'Overwrite files in the private store, bypassing validation checks (creates a local backup first)' }
    ],
    example: 'pgit push .\npgit push todo.md'
  },
  pull: {
    title: 'pgit pull &lt;paths...&gt;',
    desc: 'Restores canonical files from the private config store back into your working directory paths. Use "." to pull all mapped configurations for this project.',
    options: [
      { name: '--force', desc: 'Force pull and overwrite local repository files (creates backups for any conflicts)' }
    ],
    example: 'pgit pull .\npgit pull .claude/settings.json'
  },
  status: {
    title: 'pgit status',
    desc: 'Compares cryptographic hashes of your local workspace files against copies in the private store. Displays detailed drift states for tracked paths.',
    options: [],
    example: 'pgit status'
  },
  drop: {
    title: 'pgit drop &lt;paths...&gt;',
    desc: 'Removes the local files from the working tree to clean your workspace before committing or creating a pull request. Mapped private copies remain safe in the store.',
    options: [
      { name: '--force', desc: 'Remove local workspace copies even if they have unsaved modifications' }
    ],
    example: 'pgit drop .'
  },
  config: {
    title: 'pgit config &lt;subcommand&gt;',
    desc: 'Manages system-level configurations, project locations, metadata backup, and database integrity.',
    options: [
      { name: 'init', desc: 'Initialize global user configuration directories' },
      { name: 'location', desc: 'Show workspace database paths and project store URIs' },
      { name: 'info', desc: 'Display global preset and synchronization summary' },
      { name: 'edit', desc: 'Open global config in default terminal shell editor' },
      { name: 'backup', desc: 'Create a zip package backup of your private configuration database' },
      { name: 'reset --force', desc: 'Reset global settings to factory defaults' }
    ],
    example: 'pgit config location\npgit config backup'
  }
};

function initCommandExplorer() {
  const tabs = document.querySelectorAll('.explorer-tab');
  const detailContainer = document.getElementById('explorerDetail');

  if (!tabs.length || !detailContainer) return;

  const renderCommand = (cmdKey) => {
    const cmd = COMMAND_DATABASE[cmdKey];
    if (!cmd) return;

    let optionsHtml = '';
    if (cmd.options && cmd.options.length > 0) {
      optionsHtml = `
        <div>
          <h4 class="detail-options-title">Available Flags / Subcommands</h4>
          <div class="detail-options-list">
            ${cmd.options.map(opt => `
              <div class="detail-option-row">
                <span class="option-name">${opt.name}</span>
                <span class="option-desc">${opt.desc}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    detailContainer.innerHTML = `
      <div class="detail-header">
        <h3 class="detail-title">${cmd.title}</h3>
        <p class="detail-desc">${cmd.desc}</p>
      </div>
      ${optionsHtml}
      <div>
        <h4 class="detail-options-title font-mono">Usage Example</h4>
        <pre class="detail-example font-mono"><code>${cmd.example}</code></pre>
      </div>
    `;
  };

  // Set default view to 'add'
  renderCommand('add');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      const cmdKey = tab.dataset.cmd;
      renderCommand(cmdKey);
    });
  });
}

/**
 * FAQ Accordion Toggler
 */
function initFaqAccordion() {
  const triggers = document.querySelectorAll('.faq-trigger');

  triggers.forEach(trigger => {
    trigger.addEventListener('click', () => {
      const item = trigger.closest('.faq-item');
      if (!item) return;

      const isActive = item.classList.contains('active');

      // Close all accordion items
      document.querySelectorAll('.faq-item').forEach(i => {
        i.classList.remove('active');
      });

      // Toggle current item
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

/**
 * Copy to Clipboard for Install Command
 */
function initCopyToClipboard() {
  const btn = document.getElementById('btnCopy');
  if (!btn) return;

  const iconCopy = btn.querySelector('.icon-copy');
  const iconCheck = btn.querySelector('.icon-check');

  btn.addEventListener('click', () => {
    const textToCopy = 'npm install -g pgit-cli';
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      // Toggle icons
      if (iconCopy && iconCheck) {
        iconCopy.classList.add('hidden');
        iconCheck.classList.remove('hidden');

        // Revert back
        setTimeout(() => {
          iconCopy.classList.remove('hidden');
          iconCheck.classList.add('hidden');
        }, 2000);
      }
    }).catch(err => {
      console.error('Failed to copy text: ', err);
    });
  });
}

/**
 * Intersection Observer Scroll Animations
 */
function initScrollReveal() {
  // Respect user preference for reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const observerOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.15
  };

  const revealCallback = (entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('revealed');
        // Stop observing once animated
        observer.unobserve(entry.target);
      }
    });
  };

  const observer = new IntersectionObserver(revealCallback, observerOptions);

  // Targets to reveal
  const targets = [
    ...document.querySelectorAll('.bento-cell'),
    ...document.querySelectorAll('.step-card'),
    ...document.querySelectorAll('.arch-card'),
    ...document.querySelectorAll('.faq-item'),
    document.querySelector('.explorer-container'),
    document.querySelector('.terminal-mockup')
  ];

  targets.forEach(target => {
    if (target) {
      target.classList.add('reveal-init');
      observer.observe(target);
    }
  });
}

// Add base classes for scroll animations to styles.css inline
const style = document.createElement('style');
style.textContent = `
  .reveal-init {
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), 
                transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .revealed {
    opacity: 1;
    transform: translateY(0);
  }
  /* Stagger delays for items */
  .step-card:nth-child(2) { transition-delay: 0.1s; }
  .step-card:nth-child(3) { transition-delay: 0.2s; }
  .arch-card:nth-child(3) { transition-delay: 0.1s; }
`;
document.head.appendChild(style);
