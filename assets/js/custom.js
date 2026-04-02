document.addEventListener("DOMContentLoaded", () => {
	const formMessage = document.getElementById('form-message');
	
	  document.getElementById("contact-form").addEventListener("submit", async (e) => {
	  e.preventDefault();
	  
	  const form = e.target;
	  const submitBtn = form.querySelector('button[type="submit"]');
	  submitBtn.textContent = 'Sending...';
	  submitBtn.disabled = true;
  
	  const payload = {
		name: document.getElementById("name").value.trim(),
		business_name: document.getElementById("business").value.trim(),
		email: document.getElementById("email").value.trim(),
		message: document.getElementById("message").value.trim()
	  };

	  try {
		const res = await fetch("/api/contact", {
		  method: "POST",
		  headers: { "Content-Type": "application/json" },
		  body: JSON.stringify(payload)
		});

		if (!res.ok) throw new Error();

		showContactMessage("Thanks! We’ll contact you soon.", true);
	  } catch (err) {
		showContactMessage("Something went wrong. Please try again.", false);
	  } finally {
		// Clear the form whether the submission succeeded or failed
		try { 
			form.reset();
			submitBtn.textContent = 'Start My Project';
		} catch (e) {}
	  }
	});

	// helper to display inline success/error messages
	function showContactMessage(text, status) {
		setTimeout(() => {
			 if (status) {
			  formMessage.className = 'mt-6 text-center text-lg font-medium text-green-600';
			} else {
			  formMessage.className = 'mt-6 text-center text-lg font-medium text-red-600';
			}
			formMessage.textContent = text;
		}, 1000);
	}
});

//Mobile menu
	document.addEventListener('DOMContentLoaded', function() {
		const menuBtn = document.getElementById("menu-btn");
		  const mobileMenu = document.getElementById("mobile-menu");

		  menuBtn.addEventListener("click", () => {
			mobileMenu.classList.toggle("hidden");
		  });
		  
		  //hide mobile menu on click
		  document.querySelectorAll("#mobile-menu a").forEach(link => {
		  link.addEventListener("click", () => {
			mobileMenu.classList.add("hidden");
		  });
		});
	});
	
