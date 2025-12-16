FROM node:25 AS build-env
COPY . /function
COPY function-sdk-typescript-0.1.0.tgz /function/function-sdk-typescript-0.1.0.tgz
WORKDIR /function

# This is temporary until the SDK is public
RUN npm install function-sdk-typescript-0.1.0.tgz
RUN npm ci --no-fund --only=production && npm cache clean --force
RUN npm run tsc

FROM gcr.io/distroless/nodejs24-debian12 AS image
COPY --from=build-env /function /function
EXPOSE 9443
#USER nonroot:nonroot
WORKDIR /function
CMD ["dist/main.js"]