const cursor = document.querySelector(".scent-cursor");
const noteButtons = document.querySelectorAll("[data-note]");
const filters = document.querySelectorAll("[data-filter]");
const cards = document.querySelectorAll("[data-category]");
const ritualButtons = document.querySelectorAll("[data-step]");
const ritualText = document.querySelector("#ritual-text");

const ritualCopy = {
  1: "A primeira borrifada mostra a abertura: doce, fresca, especiada ou floral.",
  2: "Depois de alguns minutos, a fragrancia aquece na pele e revela a assinatura arabe.",
  3: "Escolha o perfume que combina com sua presenca e leve esse rastro com voce."
};

let sparkTick = 0;

window.addEventListener("pointermove", (event) => {
  cursor.style.opacity = "1";
  cursor.style.left = `${event.clientX}px`;
  cursor.style.top = `${event.clientY}px`;

  sparkTick += 1;
  if (sparkTick % 7 === 0) {
    createSpark(event.clientX, event.clientY);
  }
});

window.addEventListener("pointerleave", () => {
  cursor.style.opacity = "0";
});

noteButtons.forEach((button) => {
  button.addEventListener("click", () => {
    burst(button.getBoundingClientRect());
    button.animate(
      [
        { transform: "translateY(-3px) scale(1)" },
        { transform: "translateY(-8px) scale(1.08)" },
        { transform: "translateY(-3px) scale(1)" }
      ],
      { duration: 520, easing: "cubic-bezier(.2,.8,.2,1)" }
    );
  });
});

filters.forEach((filter) => {
  filter.addEventListener("click", () => {
    const value = filter.dataset.filter;
    filters.forEach((item) => item.classList.remove("active"));
    filter.classList.add("active");

    cards.forEach((card) => {
      const show = value === "todos" || card.dataset.category === value;
      card.classList.toggle("is-hidden", !show);
    });
  });
});

ritualButtons.forEach((button) => {
  button.addEventListener("click", () => {
    ritualButtons.forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    ritualText.textContent = ritualCopy[button.dataset.step];
  });
});

function createSpark(x, y) {
  const spark = document.createElement("span");
  spark.className = "spark";
  spark.style.left = `${x}px`;
  spark.style.top = `${y}px`;
  spark.style.setProperty("--x", `${Math.random() * 80 - 40}px`);
  spark.style.setProperty("--y", `${Math.random() * -70 - 20}px`);
  document.body.appendChild(spark);
  spark.addEventListener("animationend", () => spark.remove());
}

function burst(rect) {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  for (let i = 0; i < 16; i += 1) {
    createSpark(x + Math.random() * 18 - 9, y + Math.random() * 18 - 9);
  }
}
