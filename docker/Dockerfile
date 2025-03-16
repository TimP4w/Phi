FROM alpine:latest

RUN addgroup -S phi && adduser -S phi -G phi

WORKDIR /phi

COPY  dist/web /phi/web
COPY  dist/phi /phi/phi

RUN chmod +x /phi/phi

EXPOSE 8080

USER phi

CMD ["./phi/phi", "-frontend", "/phi/web"]
