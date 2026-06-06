const toggle = document.getElementById("enabled-toggle");
const rmpLink = document.getElementById("rmp-link");

rmpLink.href = "https://www.ratemyprofessors.com/search/professors/361?q=*";

chrome.storage.sync.get({ enabled: true }, (result) => {
  toggle.checked = result.enabled;
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
});
