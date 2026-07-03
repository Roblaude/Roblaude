#include <libusb.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define USB_PORT_FEAT_POWER 8

static int parse_int(const char *s, int *out) {
  char *end = NULL;
  long value = strtol(s, &end, 10);
  if (end == s || *end != '\0' || value < 0 || value > 255) {
    return -1;
  }
  *out = (int)value;
  return 0;
}

static int parse_action(const char *s, int *on) {
  if (strcmp(s, "on") == 0 || strcmp(s, "1") == 0) {
    *on = 1;
    return 0;
  }
  if (strcmp(s, "off") == 0 || strcmp(s, "0") == 0) {
    *on = 0;
    return 0;
  }
  return -1;
}

int main(int argc, char **argv) {
  int bus = 0;
  int dev = 0;
  int port = 0;
  int on = 0;
  libusb_context *ctx = NULL;
  libusb_device **devices = NULL;
  libusb_device_handle *handle = NULL;
  ssize_t count = 0;
  int rc = 0;

  if (argc != 5 ||
      parse_int(argv[1], &bus) != 0 ||
      parse_int(argv[2], &dev) != 0 ||
      parse_int(argv[3], &port) != 0 ||
      port < 1 ||
      parse_action(argv[4], &on) != 0) {
    fprintf(stderr, "usage: %s <busnum> <devnum> <port> <on|off>\n", argv[0]);
    return 2;
  }

  rc = libusb_init(&ctx);
  if (rc != 0) {
    fprintf(stderr, "libusb_init: %s\n", libusb_error_name(rc));
    return 1;
  }

  count = libusb_get_device_list(ctx, &devices);
  if (count < 0) {
    fprintf(stderr, "libusb_get_device_list: %s\n", libusb_error_name((int)count));
    libusb_exit(ctx);
    return 1;
  }

  for (ssize_t i = 0; i < count; i++) {
    libusb_device *device = devices[i];
    if ((int)libusb_get_bus_number(device) == bus &&
        (int)libusb_get_device_address(device) == dev) {
      rc = libusb_open(device, &handle);
      if (rc != 0) {
        fprintf(stderr, "libusb_open bus=%d dev=%d: %s\n", bus, dev, libusb_error_name(rc));
      }
      break;
    }
  }

  if (handle == NULL) {
    if (rc == 0) {
      fprintf(stderr, "hub introuvable bus=%d dev=%d\n", bus, dev);
    }
    libusb_free_device_list(devices, 1);
    libusb_exit(ctx);
    return 1;
  }

  rc = libusb_control_transfer(
      handle,
      LIBUSB_ENDPOINT_OUT | LIBUSB_REQUEST_TYPE_CLASS | LIBUSB_RECIPIENT_OTHER,
      on ? LIBUSB_REQUEST_SET_FEATURE : LIBUSB_REQUEST_CLEAR_FEATURE,
      USB_PORT_FEAT_POWER,
      (uint16_t)port,
      NULL,
      0,
      2000);

  if (rc < 0) {
    fprintf(stderr, "port %d %s: %s\n", port, on ? "on" : "off", libusb_error_name(rc));
    libusb_close(handle);
    libusb_free_device_list(devices, 1);
    libusb_exit(ctx);
    return 1;
  }

  printf("hub bus=%d dev=%d port=%d %s\n", bus, dev, port, on ? "on" : "off");
  libusb_close(handle);
  libusb_free_device_list(devices, 1);
  libusb_exit(ctx);
  return 0;
}
