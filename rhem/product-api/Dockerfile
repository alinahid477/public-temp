# Use a lightweight official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy the package.json file first to leverage Docker cache
COPY package.json ./

# Install the application dependencies
RUN npm install

# Copy the rest of your application code into the container
COPY . .

# Expose port 3000 to the host environment
EXPOSE 3000

# Command to run the application
CMD ["npm", "start"]


# docker build -t quay.io/alitestseverything/product-api:v1 .
# docker run --rm --name product-api -p 3000:3000 quay.io/alitestseverything/product-api:v1