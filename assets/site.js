function initMobileMenu() {
  const menuBtn = document.getElementById("menuBtn");
  const mobileLinks = document.getElementById("mobileLinks");

  if (!menuBtn || !mobileLinks) {
    return;
  }

  menuBtn.addEventListener("click", () => {
    mobileLinks.classList.toggle("open");
  });

  mobileLinks.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mobileLinks.classList.remove("open");
    });
  });
}

function updateCartBadges() {
  if (!window.BrownieStore) {
    return;
  }

  const count = window.BrownieStore.getCart().reduce((sum, item) => sum + item.qty, 0);
  document.querySelectorAll(".cart-count").forEach((node) => {
    node.textContent = String(count);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  updateCartBadges();
});
