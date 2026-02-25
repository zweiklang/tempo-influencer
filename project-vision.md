## General vision for the project

Ok I have a vision of a locally running web application that can read and update project information in Tempo/Jira.

## User stories

- I want to be able to connect my Jira instance and select a tempo financial project that I want to work with (by name). For that I need to provide API keys for both Jira and Tempo. I also want to be able to change the selected project and API keys at any time.
- I want to be able to access a tempo financial project and get information of the currently set budget for that project.
- I can pick a time period and see how many hours total have been logged for this very project in the given time period, by whom and for which issues in the form of user (team role (NOT permission role)) - issue title - logged hours - billing rate (of the project if possible) - revenue in the time period.
- I want to be able to pick a tempo team and assign users to the project and review and eventually reassign their team roles and their billing rates
- I want to be able to see the total current revenue on the project in the given time period based on the billing rates (of the project, if possible)

## budget delta mode

- I want to be able to go into "budget delta mode": I am asked which revenue should be achieved for the given time period, then pick the team roles that will be participating in the efforts to achieve that revenue. The number must be higher than the current revenue.
- Based on the entered revenue, the system should calculate which team roles with their billing rates need to work how many hours to achieve that budget. For calculation: only half-hour steps. Round properly to the nearest half-hour.
- Then I want to be able to pick _open_ issues from the project (should be prefetched and easily pickable by name, but also need the issue key) and who of the team will work on which ones. Then the system should give a preview of how it would distribute the hours on the team members and their assigned issues to achieve that revenue.
- I want to be able to easily change these figures myself or "reroll" and the app tries to reshuffle the hours between team members to achieve the budget goal. If I click "Perform worklog updates" (submit), then then logged hours in the project should be updated or added with the following rules:
  - Only log hours Monday to Friday and within the given period, no weekend logging; Spread logged hours somewhat evenly across the given period, but not necessarily in a perfectly even way.
  - If there are already logged hours for a user on a given day, then log the new hours on the same day, but not more than 8 hours per day. If there are already 8 hours logged for a user on a given day, then log the new hours on the next day, but not more than 8 hours per day. If there are already 8 hours logged for a user on all days in the given period, only then exceed the 8 hours per day rule.

## Arhcitecture

- The app should be a locally running web application, so that users can easily access it via their browser and it can be easily updated and maintained.
- The app should be built with a modern web framework (e.g. React, Vue, Angular) for the frontend and a lightweight backend (e.g. Node.js, Flask) to handle API requests and business logic.
- The app should use the Jira and Tempo APIs to fetch and update project information, worklogs, team members, and billing rates.
- The app should have a clean and intuitive user interface to allow users to easily navigate and perform the desired actions. (shadcn/ui components could be a good choice for that)
- The app should handle authentication securely, storing API keys in a secure manner (e.g. encrypted local storage or secure session management).
- The app should be designed with scalability in mind, allowing for future enhancements and additional features as needed.
- The app should have error handling and validation to ensure that users are informed of any issues or incorrect inputs when interacting with the application.
- The app should be responsive and accessible, ensuring that it can be used on various devices and by users with different accessibility needs.
- The app should have a modular architecture, separating concerns such as data fetching, state management, and UI components to facilitate maintainability and extensibility.
- The app should have a clear and consistent design language, using a cohesive color scheme, typography, and layout to enhance the user experience and make it visually appealing.
- The app should have a testing strategy in place, including unit tests for individual components and integration tests for the overall functionality of the application to ensure reliability and robustness.
- The app should have documentation for both users and developers, providing clear instructions on how to use the application and how to contribute to its development or maintenance.
- The app should have a deployment strategy, allowing users to easily set up and run the application locally, with clear instructions and necessary dependencies outlined in the documentation.
- The app should have a version control system in place (e.g. Git) to manage code changes and facilitate collaboration among developers, if applicable.
- The app should have a logging mechanism to track user actions and system events, which can be useful for debugging and monitoring the application's performance and usage.
- The app should have a backup and recovery strategy to ensure that user data and project information are protected in case of any unforeseen issues or data loss.
- research which data would need to be stored locally (e.g. selected project, team members and roles, billing rates for each team role, API keys, user preferences) and implement a secure and efficient way to store this data (e.g. encrypted local storage, secure cookies).
