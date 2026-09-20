document.addEventListener("DOMContentLoaded", () => {
  const images = document.querySelectorAll(".post-body img");

  if (!images.length || typeof HTMLDialogElement === "undefined") {
    return;
  }

  const dialog = document.createElement("dialog");
  const enlargedImage = document.createElement("img");
  let sourceImage = null;

  dialog.className = "image-lightbox";
  dialog.tabIndex = -1;
  dialog.append(enlargedImage);
  document.body.append(dialog);

  const openImage = (image) => {
    sourceImage = image;
    enlargedImage.src = image.currentSrc || image.src;
    enlargedImage.alt = image.alt;
    dialog.setAttribute(
      "aria-label",
      image.alt ? `Enlarged image: ${image.alt}` : "Enlarged image"
    );
    document.documentElement.classList.add("lightbox-open");
    dialog.showModal();
    dialog.focus();
  };

  images.forEach((image) => {
    image.classList.add("zoomable-image");
    image.tabIndex = 0;
    image.setAttribute("role", "button");
    image.setAttribute("aria-label", image.alt ? `Enlarge image: ${image.alt}` : "Enlarge image");

    image.addEventListener("click", (event) => {
      event.preventDefault();
      openImage(image);
    });

    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openImage(image);
      }
    });
  });

  dialog.addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("lightbox-open");
    sourceImage?.focus();
  });
});
