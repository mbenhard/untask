// ── Theme toggle ────────────────────────────────────
const toggle = document.getElementById('theme-toggle');
const root = document.documentElement;

function setTheme(theme) {
  if (theme === 'light') {
    root.setAttribute('data-theme', 'light');
    toggle.textContent = 'light mode';
    localStorage.setItem('unship-kb-theme', 'light');
  } else {
    root.removeAttribute('data-theme');
    toggle.textContent = 'dark mode';
    localStorage.setItem('unship-kb-theme', 'dark');
  }
}

// Restore saved theme
const saved = localStorage.getItem('unship-kb-theme');
if (saved === 'light') setTheme('light');

toggle.addEventListener('click', () => {
  const isLight = root.hasAttribute('data-theme');
  setTheme(isLight ? 'dark' : 'light');
});

// ── Active nav tracking ─────────────────────────────
const navLinks = document.querySelectorAll('.nav-link');
const sections = [];

navLinks.forEach(link => {
  const id = link.getAttribute('href')?.slice(1);
  if (id) {
    const el = document.getElementById(id);
    if (el) sections.push({ id, el, link });
  }
});

function updateActiveNav() {
  const scrollY = window.scrollY + 60;

  let current = sections[0];
  for (const s of sections) {
    if (s.el.offsetTop <= scrollY) {
      current = s;
    }
  }

  navLinks.forEach(l => l.classList.remove('active'));
  if (current) current.link.classList.add('active');
}

window.addEventListener('scroll', updateActiveNav, { passive: true });
updateActiveNav();

// ── Search / filter ─────────────────────────────────
const searchInput = document.getElementById('search');

searchInput.addEventListener('input', () => {
  const query = searchInput.value.toLowerCase().trim();

  navLinks.forEach(link => {
    const text = link.textContent.toLowerCase();
    link.style.display = (!query || text.includes(query)) ? '' : 'none';
  });

  // Also show/hide nav group labels if all children hidden
  document.querySelectorAll('.nav-group').forEach(group => {
    const visible = group.querySelectorAll('.nav-link:not([style*="display: none"])');
    group.style.display = visible.length === 0 && query ? 'none' : '';
  });
});

// ── Keyboard shortcut: focus search ─────────────────
document.addEventListener('keydown', e => {
  if (e.key === '/' && document.activeElement !== searchInput) {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === 'Escape' && document.activeElement === searchInput) {
    searchInput.value = '';
    searchInput.dispatchEvent(new Event('input'));
    searchInput.blur();
  }
});

// ── Mobile sidebar toggle ───────────────────────────
const mobileToggle = document.getElementById('mobile-toggle');
const sidebar = document.getElementById('sidebar');

mobileToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Close sidebar on nav click (mobile)
navLinks.forEach(link => {
  link.addEventListener('click', () => {
    sidebar.classList.remove('open');
  });
});
