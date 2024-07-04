// Assuming you have a function to fetch data as described earlier
async function renderReferralAnalytics() {
    try {
        const data = await fetchReferralAnalytics();

        // Assuming you have a container in your HTML to display the data
        const referralAnalyticsContainer = document.getElementById('referralAnalytics');

        // Clear previous content if any
        referralAnalyticsContainer.innerHTML = '';

        // Iterate through each date in analytics data
        Object.keys(data.analytics).forEach(date => {
            const dateData = data.analytics[date];

            // Create a section for each date
            const dateSection = document.createElement('div');
            dateSection.classList.add('date-section');

            // Display date
            const dateHeading = document.createElement('h2');
            dateHeading.textContent = `Date: ${date}`;
            dateSection.appendChild(dateHeading);

            // Iterate through age groups (infants, children, adults)
            Object.keys(dateData).forEach(ageGroup => {
                const ageGroupData = dateData[ageGroup];

                // Create a subsection for each age group
                const ageGroupSection = document.createElement('div');
                ageGroupSection.classList.add('age-group-section');

                // Display age group
                const ageGroupHeading = document.createElement('h3');
                ageGroupHeading.textContent = `${ageGroup.charAt(0).toUpperCase() + ageGroup.slice(1)}`;
                ageGroupSection.appendChild(ageGroupHeading);

                // Iterate through genders (male, female)
                ['male', 'female'].forEach(gender => {
                    const genderData = ageGroupData[gender];

                    // Create a paragraph for each gender
                    const genderParagraph = document.createElement('p');
                    genderParagraph.textContent = `${gender.charAt(0).toUpperCase() + gender.slice(1)}: ${genderData.total}`;
                    ageGroupSection.appendChild(genderParagraph);
                });

                // Append age group section to date section
                dateSection.appendChild(ageGroupSection);
            });

            // Append date section to container
            referralAnalyticsContainer.appendChild(dateSection);
        });

        // Display totals
        const totalsSection = document.createElement('div');
        totalsSection.classList.add('totals-section');
        const totalsHeading = document.createElement('h2');
        totalsHeading.textContent = 'Totals';
        totalsSection.appendChild(totalsHeading);

        const totalsParagraph = document.createElement('p');
        totalsParagraph.textContent = `Total Referrals: ${data.totals.totalRefs}`;
        totalsSection.appendChild(totalsParagraph);

        // Append totals section to container
        referralAnalyticsContainer.appendChild(totalsSection);

    } catch (error) {
        console.error('Error rendering data:', error.message);
        // Handle errors or display error messages
    }
}

// Call renderReferralAnalytics when the page loads
document.addEventListener('DOMContentLoaded', renderReferralAnalytics);
