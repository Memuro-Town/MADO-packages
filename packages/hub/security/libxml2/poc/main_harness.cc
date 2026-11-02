#include <iostream>
#include <fstream>
#include <vector>
#include <cstdint>
#include <cstdlib>

// Assume LLVMFuzzerTestOneInput is already defined
extern "C" int LLVMFuzzerTestOneInput(const uint8_t *data, size_t size);

int main(int argc, char **argv) {
    std::vector<uint8_t> buffer;

    if (argc > 1) {
        // Read input from a file
        std::ifstream file(argv[1], std::ios::binary);
        if (!file) {
            std::cerr << "Error opening file: " << argv[1] << "\n";
            return 1;
        }
        buffer.assign((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    } else {
        std::cerr << "No file provided.\n";
        return 1;
    }

    // Call the fuzz test function
    LLVMFuzzerTestOneInput(buffer.data(), buffer.size());

    return 0;
}

